// Removes media rows without a product and files under products/ without a
// media row (spec D6). Usage: pnpm media:prune [--apply]
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "../import/cli.mts";
import { parseRemoveEnv } from "../import/env.mts";
import { err, ok, type Result } from "../import/result.mts";

export type MediaRow = { id: number; storagePath: string; linked: boolean };
export type StoredObject = { path: string; createdAt: Date };
export type PruneDeps = {
  readRows(): Promise<Result<MediaRow[], string>>;
  listObjects(): Promise<Result<StoredObject[], string>>;
  deleteRows(ids: number[]): Promise<Result<null, string>>;
  removeFiles(paths: string[]): Promise<Result<null, string>>;
};

const PREFIX = "products/";
const MIN_AGE_MS = 60 * 60 * 1000; // protects an upload in flight
const USAGE = "usage: pnpm media:prune [--apply]";

export function planPrune(
  rows: MediaRow[],
  objects: StoredObject[],
  now: Date
): { rowIds: number[]; files: string[] } {
  const referenced = new Set(
    rows.filter((r) => r.linked).map((r) => r.storagePath)
  );
  const unlinked = rows.filter((r) => !r.linked);
  const unlinkedPaths = new Set(unlinked.map((r) => r.storagePath));
  const files = objects
    .filter(
      (o) =>
        o.path.startsWith(PREFIX) &&
        !referenced.has(o.path) &&
        (unlinkedPaths.has(o.path) ||
          now.getTime() - o.createdAt.getTime() > MIN_AGE_MS)
    )
    .map((o) => o.path)
    .sort();
  return { rowIds: unlinked.map((r) => r.id).sort((a, b) => a - b), files };
}

export async function runPrune(
  deps: PruneDeps,
  apply: boolean,
  io: Pick<CliIo, "log" | "error">,
  now: Date = new Date()
): Promise<number> {
  const rows = await deps.readRows();
  if (!rows.ok) {
    io.error(rows.error);
    return 1;
  }
  const objects = await deps.listObjects();
  if (!objects.ok) {
    io.error(objects.error);
    return 1;
  }
  // A listing that finds nothing although media rows are linked means a wrong
  // bucket or key; planning on it could not tell live files from orphans.
  if (objects.value.length === 0 && rows.value.some((r) => r.linked)) {
    io.error(
      "Linked media rows exist but no files were found under products/. Nothing was changed."
    );
    return 1;
  }
  const plan = planPrune(rows.value, objects.value, now);
  io.log(`unlinked media rows: ${plan.rowIds.length}`);
  io.log(`orphan files: ${plan.files.length}`);
  for (const path of plan.files) io.log(`  ${path}`);
  if (!apply) {
    io.log("Dry run - re-run with --apply to delete.");
    return 0;
  }
  if (plan.rowIds.length > 0) {
    const deleted = await deps.deleteRows(plan.rowIds);
    if (!deleted.ok) {
      io.error(deleted.error);
      return 1;
    }
  }
  for (let i = 0; i < plan.files.length; i += 100) {
    const removed = await deps.removeFiles(plan.files.slice(i, i + 100));
    if (!removed.ok) {
      io.error(removed.error);
      return 1;
    }
  }
  io.log("Done.");
  return 0;
}

// PostgREST caps a response at the server's max_rows, so read in windows.
export const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<Result<T[], string>> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return err(error.message);
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) return ok(all);
  }
}

// A missing or unparsable date counts as "just created" so the file is kept.
export function parseCreatedAt(value: string | null | undefined, now: Date) {
  if (!value) return now;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? now : date;
}

async function listWithDates(
  client: SupabaseClient<Database>,
  prefix: string
): Promise<Result<StoredObject[], string>> {
  const bucket = client.storage.from("catalog");
  const found: StoredObject[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
    if (error) return err(`listing ${prefix} failed: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        // Storage lists folders as entries without an id.
        const nested = await listWithDates(client, path);
        if (!nested.ok) return nested;
        found.push(...nested.value);
      } else {
        found.push({
          path,
          createdAt: parseCreatedAt(entry.created_at, new Date()),
        });
      }
    }
    if ((data ?? []).length < 1000) return ok(found);
  }
}

export function supabaseDeps(client: SupabaseClient<Database>): PruneDeps {
  return {
    async readRows() {
      const rows = await fetchAllPages((from, to) =>
        client
          .from("media")
          .select("id, storage_path, product_media(product_id)")
          .order("id")
          .range(from, to)
      );
      if (!rows.ok) return err(`reading media failed: ${rows.error}`);
      return ok(
        rows.value.map((m) => ({
          id: m.id,
          storagePath: m.storage_path,
          linked: m.product_media.length > 0,
        }))
      );
    },
    listObjects: () => listWithDates(client, "products"),
    async deleteRows(ids) {
      const { error } = await client.from("media").delete().in("id", ids);
      return error
        ? err(`deleting media rows failed: ${error.message}`)
        : ok(null);
    },
    async removeFiles(paths) {
      const { error } = await client.storage.from("catalog").remove(paths);
      return error ? err(`removing files failed: ${error.message}`) : ok(null);
    },
  };
}

export async function runPruneCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let apply = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { apply: { type: "boolean" } },
      strict: true,
    });
    apply = values.apply ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
    io.error(USAGE);
    return 2;
  }
  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const client = createClient<Database>(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return runPrune(supabaseDeps(client), apply, io);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runPruneCli(process.argv.slice(2), {
      env: process.env,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    });
    process.exit(code);
  } catch (error: unknown) {
    console.error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

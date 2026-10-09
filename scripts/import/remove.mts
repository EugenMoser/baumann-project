// Deletes every catalog row and every object in the catalog bucket.
// Usage: pnpm catalog:remove --confirm <host of IMPORT_SUPABASE_URL>
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "./cli.mts";
import { parseRemoveEnv } from "./env.mts";
import { listObjects } from "./images.mts";

const USAGE =
  "usage: pnpm catalog:remove --confirm <host of IMPORT_SUPABASE_URL>";

export async function runRemoveCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let confirm: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { confirm: { type: "string" } },
      strict: true,
    });
    confirm = values.confirm;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (confirm === undefined) {
    io.error(USAGE);
    return 2;
  }

  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const host = new URL(env.value.IMPORT_SUPABASE_URL).host;
  if (confirm !== host) {
    io.error(
      `Refusing: --confirm must be exactly "${host}". Nothing was deleted.`
    );
    return 1;
  }

  const supabase = createClient<Database>(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("remove_catalog");
  if (error) {
    io.error(
      `Database rejected the removal: ${error.message} — nothing was deleted.`
    );
    return 1;
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data))
    for (const [key, value] of Object.entries(data))
      io.log(`${key}: ${String(value)}`);

  const emptied = await supabase.storage.emptyBucket("catalog");
  if (emptied.error) {
    io.error(
      `Rows deleted, but emptying the bucket failed: ${emptied.error.message}. Re-run to finish.`
    );
    return 1;
  }
  const remaining = await listObjects(supabase.storage.from("catalog"), "");
  if (!remaining.ok) {
    io.error(
      `Rows deleted, but verifying the bucket failed: ${remaining.error}. Re-run to finish.`
    );
    return 1;
  }
  if (remaining.value.length > 0) {
    io.error(
      `Rows deleted, but ${remaining.value.length} object(s) remain in the bucket catalog. Re-run to finish.`
    );
    return 1;
  }
  io.log("Storage bucket catalog emptied.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runRemoveCli(process.argv.slice(2), {
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

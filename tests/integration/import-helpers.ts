import { execSync } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CliIo } from "../../scripts/import/cli.mts";
import { makePng } from "../import/png";

export const FIXTURE_IMAGES: ReadonlyMap<string, Buffer> = new Map([
  ["a_98010-Testkeil.webp", makePng(40, 30)],
  ["b1_98010-Testkeil.webp", makePng(80, 60)],
  ["a_98020_Testhalter.webp", makePng(50, 50)],
]);

export const CATALOG_TABLES = [
  "category",
  "attribute",
  "category_attribute",
  "material",
  "product",
  "article",
  "article_attribute",
  "article_packaging",
  "product_accessory",
  "color",
  "product_color",
  "media",
  "product_media",
  "ai_generation",
  "certificate_document",
  "certificate",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set (see vitest.integration.config.mts)`);
  return value;
}

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("IMPORT_SUPABASE_URL"),
    requireEnv("IMPORT_SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export function importEnv(baseUrl: string): Record<string, string> {
  return {
    IMPORT_SUPABASE_URL: requireEnv("IMPORT_SUPABASE_URL"),
    IMPORT_SUPABASE_SECRET_KEY: requireEnv("IMPORT_SUPABASE_SECRET_KEY"),
    IMPORT_IMAGE_BASE_URL: baseUrl,
  };
}

export function silentIo(
  env: Record<string, string | undefined>
): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return {
    env,
    lines,
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
}

export async function startImageServer(files: ReadonlyMap<string, Buffer>) {
  const server = createServer((request, response) => {
    const name = decodeURIComponent((request.url ?? "").split("/").pop() ?? "");
    const body = files.get(name);
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "image/png" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo; // listen() on TCP always yields AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}/cdn/folder`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function copyFixtureSnapshot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "import-snapshot-"));
  await cp(join(process.cwd(), "tests/fixtures/import/snapshot"), dir, {
    recursive: true,
  });
  return dir;
}

export async function tableCounts(
  client = serviceClient()
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of CATALOG_TABLES) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

/** Restores migrations + seed and waits until the API answers again. */
export async function resetDatabase(): Promise<void> {
  execSync("pnpm exec supabase db reset", { stdio: "ignore" });
  const client = serviceClient();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { error } = await client.from("category").select("id").limit(1);
    if (!error) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not come back after db reset");
}

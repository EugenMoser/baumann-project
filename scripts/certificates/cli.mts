// Imports the ISO certificates from a local directory with a manifest.
// Usage: pnpm certificates:import --dir <dir> [--dry-run]
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "../import/cli.mts";
import { parseRemoveEnv } from "../import/env.mts";
import { deleteOrphans } from "../import/images.mts";
import { readCertificates, toPayload } from "./manifest.mts";

const USAGE = "usage: pnpm certificates:import --dir <dir> [--dry-run]";

export async function runCertificatesCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let dir: string | undefined;
  let dryRun = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { dir: { type: "string" }, "dry-run": { type: "boolean" } },
      strict: true,
    });
    dir = values.dir;
    dryRun = values["dry-run"] ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (dir === undefined) {
    io.error(USAGE);
    return 2;
  }
  const fromCwd = relative(process.cwd(), resolve(dir));
  if (fromCwd === "" || (!fromCwd.startsWith("..") && !isAbsolute(fromCwd))) {
    io.error(
      "The certificate directory must live outside the repository (customer data)."
    );
    return 2;
  }

  const certificates = await readCertificates(dir);
  if (!certificates.ok) {
    io.error(`Manifest rejected: ${certificates.error}`);
    return 1;
  }
  const documents = certificates.value.reduce(
    (n, c) => n + c.documents.length,
    0
  );
  if (dryRun) {
    io.log(
      `Dry run: ${certificates.value.length} certificate(s), ${documents} document(s) — nothing written.`
    );
    return 0;
  }

  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const supabase = createClient<Database>(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const bucket = supabase.storage.from("catalog");

  const files = certificates.value.flatMap((c) => [c.preview, ...c.documents]);
  for (const file of files) {
    const { error } = await bucket.upload(file.storagePath, file.bytes, {
      upsert: true,
      contentType: file.contentType,
    });
    if (error) {
      io.error(
        `Upload of ${file.storagePath} failed: ${error.message} — no rows were written.`
      );
      return 1;
    }
  }

  const payload = toPayload(certificates.value) as unknown as Json; // plain JSON data built above
  const { data, error } = await supabase.rpc("import_certificates", {
    payload,
  });
  if (error) {
    io.error(
      `Database rejected the certificates: ${error.message} — no rows were written.`
    );
    return 1;
  }
  io.log(`Imported: ${JSON.stringify(data)}`);

  const removed = await deleteOrphans(
    bucket,
    new Set(files.map((f) => f.storagePath)),
    "certificates"
  );
  if (!removed.ok) {
    io.error(
      `Rows written, but cleaning up old files failed: ${removed.error}. Re-run to finish.`
    );
    return 1;
  }
  io.log(`Removed ${removed.value} unreferenced file(s) under certificates/.`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runCertificatesCli(process.argv.slice(2), {
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

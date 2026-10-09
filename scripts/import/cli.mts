// Imports the legacy catalog from a local snapshot directory.
// Usage: pnpm catalog:import --snapshot <dir> [--dry-run]
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { parseImportEnv } from "./env.mts";
import type { Finding } from "./findings.mts";
import { deleteOrphans, fetchImages, uploadImages } from "./images.mts";
import {
  completePayload,
  mapSnapshot,
  type CatalogStats,
} from "./map/index.mts";
import { writeReport } from "./report.mts";
import { readSnapshot } from "./snapshot.mts";

export type CliIo = {
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  fetch?: typeof fetch;
  now?: () => Date;
};

const USAGE = "usage: pnpm catalog:import --snapshot <dir> [--dry-run]";

export async function runImportCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let snapshotDir: string | undefined;
  let dryRun = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { snapshot: { type: "string" }, "dry-run": { type: "boolean" } },
      strict: true,
    });
    snapshotDir = values.snapshot;
    dryRun = values["dry-run"] ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (snapshotDir === undefined) {
    io.error(USAGE);
    return 2;
  }

  const env = parseImportEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const snapshot = await readSnapshot(snapshotDir);
  if (!snapshot.ok) {
    io.error(`Snapshot rejected: ${snapshot.error.message}`);
    return 1;
  }
  const reportPath = join(snapshotDir, "import-report.md");
  const now = io.now ?? (() => new Date());
  const report = async (
    outcome: string,
    findings: readonly Finding[],
    stats: CatalogStats | null,
    result: Record<string, unknown> | null = null
  ) => {
    await writeReport(reportPath, {
      generatedAt: now(),
      mode: dryRun ? "dry-run" : "import",
      outcome,
      stats,
      findings,
      result,
    });
    io.log(`Report: ${reportPath}`);
  };
  const mapped = mapSnapshot(snapshot.value, {
    imageBaseUrl: env.value.IMPORT_IMAGE_BASE_URL,
  });
  if (!mapped.ok) {
    await report(`aborted: invalid data (${mapped.error.message})`, [], null);
    io.error(`Invalid data: ${mapped.error.message}`);
    return 1;
  }
  const { findings, stats } = mapped.value;

  if (dryRun) {
    await report("dry run — nothing written", findings, stats);
    io.log(
      `Dry run: ${stats.products} products, ${stats.articles} articles, ${stats.images} images mapped.`
    );
    return 0;
  }

  const images = await fetchImages(
    mapped.value.media.map((m) => ({
      url: m.url,
      storagePath: m.storage_path,
      contentType: m.content_type,
    })),
    io.fetch ?? fetch
  );
  if (images.failures.length > 0) {
    const failed: Finding[] = images.failures.map((f) => ({
      kind: "failed_image",
      ...f,
    }));
    await report(
      `aborted: ${images.failures.length} image download(s) failed`,
      [...failed, ...findings],
      stats
    );
    io.error(
      `${images.failures.length} image download(s) failed — nothing was written.`
    );
    return 1;
  }

  const payload = completePayload(
    mapped.value,
    new Map(
      images.fetched.map((i) => [
        i.storagePath,
        { width: i.width, height: i.height },
      ])
    )
  );
  if (!payload.ok) {
    await report(`aborted: ${payload.error.message}`, findings, stats);
    io.error(payload.error.message);
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
  const uploaded = await uploadImages(bucket, images.fetched);
  if (!uploaded.ok) {
    await report(`aborted: ${uploaded.error}`, findings, stats);
    io.error(`${uploaded.error} — the database was not changed.`);
    return 1;
  }

  const { data, error } = await supabase.rpc("import_catalog", {
    payload: payload.value,
  });
  if (error) {
    await report(
      `aborted: database rejected the import (${error.message})`,
      findings,
      stats
    );
    io.error(
      `Database rejected the import: ${error.message} — the database was not changed; uploaded images are reused or cleaned up by the next successful run.`
    );
    return 1;
  }
  const result =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? { ...data }
      : { result: String(data) };

  const orphans = await deleteOrphans(
    bucket,
    new Set(payload.value.media.map((m) => m.storage_path))
  );
  if (!orphans.ok) {
    await report(
      `imported, but orphan cleanup failed (${orphans.error})`,
      findings,
      stats,
      result
    );
    io.error(
      `Imported, but orphan cleanup failed: ${orphans.error}. Re-run the import to finish it.`
    );
    return 1;
  }

  await report("imported", findings, stats, {
    ...result,
    deleted_objects: orphans.value,
  });
  for (const [key, value] of Object.entries(result))
    io.log(`${key}: ${String(value)}`);
  io.log(`deleted_objects: ${orphans.value}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runImportCli(process.argv.slice(2), {
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

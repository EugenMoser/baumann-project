import { fetchAllPages } from "../media/prune.mts";
import { deleteOrphans, type StorageBucket } from "./images.mts";
import { err, ok, type Result } from "./result.mts";

type PathPage = PromiseLike<{
  data: { storage_path: string }[] | null;
  error: { message: string } | null;
}>;

/** Reads every `media.storage_path` in ordered pages (PostgREST caps responses). */
export async function readMediaPaths(
  fetchPage: (from: number, to: number) => PathPage
): Promise<Result<string[], string>> {
  const rows = await fetchAllPages(fetchPage);
  if (!rows.ok) return err(`reading media paths failed: ${rows.error}`);
  return ok(rows.value.map((r) => r.storage_path));
}

/**
 * Removes files under `products/` that neither the snapshot nor any `media`
 * row references. `import_catalog` has already dropped the media rows of
 * imported products, so only files of admin-created products stay. Deletes
 * nothing when the database paths cannot be read.
 */
export async function cleanupOrphans(
  bucket: StorageBucket,
  snapshotPaths: ReadonlySet<string>,
  readDbPaths: () => Promise<Result<string[], string>>
): Promise<Result<number, string>> {
  const dbPaths = await readDbPaths();
  if (!dbPaths.ok) return dbPaths;
  return deleteOrphans(bucket, new Set([...snapshotPaths, ...dbPaths.value]));
}

import { imageSize } from "image-size";
import { err, ok, type Result } from "./result.mts";

export type ImageJob = {
  url: string;
  storagePath: string;
  contentType: string;
};
export type FetchedImage = ImageJob & {
  bytes: Uint8Array;
  width: number;
  height: number;
};
export type ImageFailure = { url: string; storagePath: string; reason: string };

type StorageError = { message: string } | null;
/** The part of a supabase-js storage bucket the importer uses. */
export type StorageBucket = {
  upload(
    path: string,
    body: Uint8Array,
    options: { upsert: boolean; contentType: string }
  ): Promise<{ error: StorageError }>;
  list(
    prefix: string,
    options: { limit: number; offset: number }
  ): Promise<{
    data: { name: string; id: string | null }[] | null;
    error: StorageError;
  }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function fetchOne(
  job: ImageJob,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<Result<FetchedImage, string>> {
  try {
    const response = await fetchFn(job.url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return err(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return err("empty response");
    const { width, height } = imageSize(bytes);
    return ok({ ...job, bytes, width, height });
  } catch (error: unknown) {
    return err(message(error));
  }
}

export async function fetchImages(
  jobs: readonly ImageJob[],
  fetchFn: typeof fetch = fetch,
  options: { concurrency?: number; timeoutMs?: number } = {}
): Promise<{ fetched: FetchedImage[]; failures: ImageFailure[] }> {
  const concurrency = options.concurrency ?? 6;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetched: FetchedImage[] = [];
  const failures: ImageFailure[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      if (job === undefined) return;
      const result = await fetchOne(job, fetchFn, timeoutMs);
      if (result.ok) fetched.push(result.value);
      else
        failures.push({
          url: job.url,
          storagePath: job.storagePath,
          reason: result.error,
        });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker)
  );
  const byPath = (a: { storagePath: string }, b: { storagePath: string }) =>
    a.storagePath.localeCompare(b.storagePath);
  return { fetched: fetched.sort(byPath), failures: failures.sort(byPath) };
}

export async function uploadImages(
  bucket: StorageBucket,
  images: readonly FetchedImage[]
): Promise<Result<number, string>> {
  for (const image of images) {
    const { error } = await bucket.upload(image.storagePath, image.bytes, {
      upsert: true,
      contentType: image.contentType,
    });
    if (error)
      return err(`upload of ${image.storagePath} failed: ${error.message}`);
  }
  return ok(images.length);
}

const PAGE = 1000;

export async function listObjects(
  bucket: StorageBucket,
  prefix: string
): Promise<Result<string[], string>> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) return err(`listing ${prefix} failed: ${error.message}`);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      // Storage lists folders as entries without an id.
      if (entry.id === null) {
        const nested = await listObjects(bucket, path);
        if (!nested.ok) return nested;
        paths.push(...nested.value);
      } else {
        paths.push(path);
      }
    }
    if (entries.length < PAGE) return ok(paths);
  }
}

export async function deleteOrphans(
  bucket: StorageBucket,
  keep: ReadonlySet<string>
): Promise<Result<number, string>> {
  const listed = await listObjects(bucket, "products");
  if (!listed.ok) return listed;
  const orphans = listed.value.filter((path) => !keep.has(path));
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await bucket.remove(orphans.slice(i, i + 100));
    if (error) return err(`deleting orphaned objects failed: ${error.message}`);
  }
  return ok(orphans.length);
}

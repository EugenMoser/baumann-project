import { err, type Result } from "@/lib/result";
import { UPLOAD_FAILED, type AdminError } from "./errors";
import type { CheckedImage } from "./image-check";

type StorageError = { message: string } | null;
/** The part of a supabase-js storage bucket the admin uses. */
export type MediaStorage = {
  upload(
    path: string,
    body: Uint8Array,
    options: { upsert: false; contentType: string }
  ): Promise<{ error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
};
// Context plus storage error text; never user-supplied values (D11).
export type FileLog = (context: string, detail: string) => void;
export type AttachInput = {
  productId: number;
  storagePath: string;
  width: number;
  height: number;
  altText: string;
};

export const newImagePath = (
  productId: number,
  extension: CheckedImage["extension"],
  uuid: string
) => `products/${productId}/${uuid}.${extension}`;

// D2 steps 3–5: upload, attach, compensate.
export async function storeImage(
  deps: {
    storage: MediaStorage;
    attach: (input: AttachInput) => Promise<Result<number, AdminError>>;
    uuid: () => string;
    log: FileLog;
  },
  input: {
    productId: number;
    image: CheckedImage;
    bytes: Uint8Array;
    altText: string;
  }
): Promise<Result<number, AdminError>> {
  const path = newImagePath(
    input.productId,
    input.image.extension,
    deps.uuid()
  );
  const uploaded = await deps.storage.upload(path, input.bytes, {
    upsert: false,
    contentType: input.image.contentType,
  });
  if (uploaded.error) {
    deps.log("[admin] upload image", uploaded.error.message);
    return err({ kind: "invalid", message: UPLOAD_FAILED });
  }
  const attached = await deps.attach({
    productId: input.productId,
    storagePath: path,
    width: input.image.width,
    height: input.image.height,
    altText: input.altText,
  });
  if (!attached.ok) await removeFiles(deps.storage, [path], deps.log);
  return attached;
}

// D5: DB first, files second; a failed removal is left to media:prune.
export async function removeFiles(
  storage: MediaStorage,
  paths: readonly string[],
  log: FileLog
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storage.remove([...paths]);
  if (error) log("[admin] remove files", error.message);
}

// SC-6: the DB result decides; files go only after the rows are gone.
export async function removeImage(deps: {
  remove: () => Promise<Result<string, AdminError>>;
  storage: MediaStorage;
  log: FileLog;
}): Promise<Result<string, AdminError>> {
  const removed = await deps.remove();
  if (removed.ok) await removeFiles(deps.storage, [removed.value], deps.log);
  return removed;
}

export async function deleteProductWithFiles(deps: {
  remove: () => Promise<Result<string[], AdminError>>;
  storage: MediaStorage;
  log: FileLog;
}): Promise<Result<string[], AdminError>> {
  const deleted = await deps.remove();
  if (deleted.ok) await removeFiles(deps.storage, deleted.value, deps.log);
  return deleted;
}

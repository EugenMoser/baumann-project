import type { ContentOrigin } from "@/lib/catalog/types";
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";
import type { AttachInput } from "./media-flow";

export type MediaItem = {
  mediaId: number;
  storagePath: string;
  width: number;
  height: number;
  altText: string;
  altOrigin: ContentOrigin;
  isThumbnail: boolean;
  sortOrder: number;
};

export async function listProductMedia(
  client: AdminClient,
  productId: number
): Promise<Result<MediaItem[], AdminError>> {
  const { data, error } = await client
    .from("product_media")
    .select(
      "role, sort_order, media(id, storage_path, width, height, alt_text, alt_origin)"
    )
    .eq("product_id", productId);
  if (error) return err(fromPg(error));
  const items = data.map((r) => ({
    mediaId: r.media.id,
    storagePath: r.media.storage_path,
    width: r.media.width,
    height: r.media.height,
    altText: r.media.alt_text,
    altOrigin: r.media.alt_origin,
    isThumbnail: r.role === "thumbnail",
    sortOrder: r.sort_order,
  }));
  // Same order as the public gallery: thumbnail first, then sort order.
  items.sort(
    (a, b) =>
      Number(b.isThumbnail) - Number(a.isThumbnail) ||
      a.sortOrder - b.sortOrder ||
      a.mediaId - b.mediaId
  );
  return ok(items);
}

export async function attachMedia(
  client: AdminClient,
  input: AttachInput
): Promise<Result<number, AdminError>> {
  const { data, error } = await client.rpc("admin_attach_media", {
    p_product_id: input.productId,
    p_storage_path: input.storagePath,
    p_width: input.width,
    p_height: input.height,
    p_alt_text: input.altText,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}

export async function setProductMedia(
  client: AdminClient,
  productId: number,
  rows: {
    mediaId: number;
    altText: string;
    altOrigin: ContentOrigin;
    isThumbnail: boolean;
  }[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_media", {
    p_product_id: productId,
    payload: rows.map((r) => ({
      media_id: r.mediaId,
      alt_text: r.altText,
      alt_origin: r.altOrigin,
      is_thumbnail: r.isThumbnail,
    })),
  });
  if (error) return err(fromPg(error));
  return ok(null);
}

export async function removeMediaRow(
  client: AdminClient,
  productId: number,
  mediaId: number
): Promise<Result<string, AdminError>> {
  const { data, error } = await client.rpc("admin_remove_media", {
    p_product_id: productId,
    p_media_id: mediaId,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}

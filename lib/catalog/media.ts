import { publicEnv } from "@/lib/env/public";
import type { ImageRef, MediaRole } from "./types";

type MediaRow = {
  role: MediaRole;
  sort_order: number;
  media: {
    storage_path: string;
    width: number;
    height: number;
    alt_text: string;
  };
};

// Files are served by the public `catalog` bucket (data model, access rules).
export function publicMediaUrl(
  storagePath: string,
  supabaseUrl: string = publicEnv.NEXT_PUBLIC_SUPABASE_URL
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/catalog/${path}`;
}

export function pickThumbnail(rows: readonly MediaRow[]): ImageRef | null {
  const byOrder = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const pick =
    byOrder.find((r) => r.role === "thumbnail") ??
    byOrder.find((r) => r.role === "gallery");
  return pick ? toImageRef(pick) : null;
}

// Select for product tiles and search thumbnails; both pick from these rows.
export const TILE_MEDIA =
  "product_media(role, sort_order, media(storage_path, width, height, alt_text))" as const;

function toImageRef(row: MediaRow): ImageRef {
  return {
    storagePath: row.media.storage_path,
    width: row.media.width,
    height: row.media.height,
    altText: row.media.alt_text,
  };
}

// Images shown for a product: all gallery rows by sort order; without any,
// the first thumbnail alone (4b D1).
export function galleryRows<T extends { role: MediaRole; sort_order: number }>(
  rows: readonly T[]
): T[] {
  const byOrder = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const gallery = byOrder.filter((r) => r.role === "gallery");
  if (gallery.length > 0) return gallery;
  const thumb = byOrder.find((r) => r.role === "thumbnail");
  return thumb ? [thumb] : [];
}

export function pickTileImage(rows: readonly MediaRow[]): ImageRef | null {
  const first = galleryRows(rows)[0];
  return first ? toImageRef(first) : null;
}

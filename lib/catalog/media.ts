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
  if (!pick) return null;
  return {
    storagePath: pick.media.storage_path,
    width: pick.media.width,
    height: pick.media.height,
    altText: pick.media.alt_text,
  };
}

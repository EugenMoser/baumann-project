import type { Finding, MapError } from "../findings.mts";
import type { PayloadProduct, PayloadProductMedia } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotProduct } from "../snapshot.mts";
import { cleanText, slugify } from "./text.mts";

export type MediaDraft = {
  storage_path: string;
  alt_text: string;
  url: string;
  content_type: string;
  legacy_product_id: number;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function resolveImageUrl(reference: string, baseUrl: string): string {
  const trimmed = reference.trim();
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).href;
  // Same convention as the old app: CDN public ids use "_" instead of spaces.
  const path = trimmed.replace(/^\/+/, "").replace(/ /g, "_");
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normaliseFileName(reference: string): string | null {
  const segment = decode(reference.trim().split(/[/\\]/).pop() ?? "");
  const dot = segment.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = segment.slice(dot + 1).toLowerCase();
  if (CONTENT_TYPES[extension] === undefined) return null;
  const base = slugify(segment.slice(0, dot));
  return base === "" ? null : `${base}.${extension}`;
}

export function mapMedia(
  products: readonly SnapshotProduct[],
  rows: readonly PayloadProduct[],
  baseUrl: string
): Result<
  {
    media: MediaDraft[];
    product_media: PayloadProductMedia[];
    findings: Finding[];
  },
  MapError
> {
  const rowById = new Map(rows.map((r) => [r.legacy_product_id, r]));
  const media: MediaDraft[] = [];
  const product_media: PayloadProductMedia[] = [];
  const findings: Finding[] = [];

  for (const p of products) {
    const row = rowById.get(p.product_id);
    if (row === undefined)
      return err({
        kind: "invalid_data",
        message: `media for unknown product ${p.product_id}`,
      });
    const small = p.imageUrls_small.filter((r) => cleanText(r) !== null);
    const big = p.imageUrls_big.filter((r) => cleanText(r) !== null);
    for (const reference of small.slice(1))
      findings.push({
        kind: "skipped_image",
        legacyProductId: row.legacy_product_id,
        reference,
      });

    const entries = [
      ...small
        .slice(0, 1)
        .map((reference) => ({ reference, role: "thumbnail" as const })),
      ...big.map((reference) => ({ reference, role: "gallery" as const })),
    ];
    const used = new Set<string>();
    for (const { reference, role } of entries) {
      const file = normaliseFileName(reference);
      if (file === null)
        return err({
          kind: "invalid_data",
          message: `product ${row.legacy_product_id}: unsupported image reference "${reference}"`,
        });
      const storage_path = `products/${row.category_slug}/${row.slug}/${file}`;
      if (used.has(storage_path)) {
        findings.push({
          kind: "skipped_image",
          legacyProductId: row.legacy_product_id,
          reference,
        });
        continue;
      }
      used.add(storage_path);
      const extension = file.slice(file.lastIndexOf(".") + 1);
      media.push({
        storage_path,
        alt_text: row.name,
        url: resolveImageUrl(reference, baseUrl),
        content_type: CONTENT_TYPES[extension] ?? "application/octet-stream",
        legacy_product_id: row.legacy_product_id,
      });
      product_media.push({
        legacy_product_id: row.legacy_product_id,
        storage_path,
        role,
        sort_order: used.size - 1,
      });
      findings.push({ kind: "alt_text_review", storagePath: storage_path });
    }
  }
  return ok({ media, product_media, findings });
}

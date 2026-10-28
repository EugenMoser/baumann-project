import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import { pickThumbnail, TILE_MEDIA } from "./media";
import type { CatalogError, SearchHit, SearchResult } from "./types";

const hitSchema = z.object({
  category_slug: z.string(),
  product_slug: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  matched_numbers: z.array(z.string()),
  match_kind: z.enum(["exact_number", "number", "text"]),
  rank: z.number(),
});

// `q` must come from parseSearchQuery (trimmed, 2–100 characters).
export function searchCatalog(
  q: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<SearchHit[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client.rpc("search_catalog", {
      q,
      max_results: 50,
    });
    if (error) return err(toDbError(error));
    const parsed = z.array(hitSchema).safeParse(data);
    if (!parsed.success) {
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected search_catalog result: ${parsed.error.message}`,
      });
    }
    return ok(
      parsed.data.map((h) => ({
        categorySlug: h.category_slug,
        productSlug: h.product_slug,
        name: h.name,
        subtitle: h.subtitle,
        matchedNumbers: h.matched_numbers,
        matchKind: h.match_kind,
      }))
    );
  });
}

export type ThumbnailRow = {
  slug: string;
  category: { slug: string };
  product_media: Parameters<typeof pickThumbnail>[0];
};

// Product slugs are unique per category only, so rows are keyed by both.
export function mergeThumbnails(
  hits: SearchHit[],
  rows: ThumbnailRow[]
): SearchResult[] {
  const byKey = new Map(
    rows.map((r) => [
      `${r.category.slug}/${r.slug}`,
      pickThumbnail(r.product_media),
    ])
  );
  return hits.map((h) => ({
    ...h,
    thumbnail: byKey.get(`${h.categorySlug}/${h.productSlug}`) ?? null,
  }));
}

export function withThumbnails(
  hits: SearchHit[],
  client: CatalogClient = createServerSupabase()
): Promise<Result<SearchResult[], CatalogError>> {
  return guard(async () => {
    if (hits.length === 0) return ok([]);
    const slugs = [...new Set(hits.map((h) => h.productSlug))];
    const { data, error } = await client
      .from("product")
      .select(`slug, category!inner(slug), ${TILE_MEDIA}` as const)
      .in("slug", slugs);
    if (error) return err(toDbError(error));
    return ok(mergeThumbnails(hits, data));
  });
}

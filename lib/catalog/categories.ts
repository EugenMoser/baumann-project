import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import { pickThumbnail } from "./media";
import type {
  CatalogError,
  CategoryListItem,
  CategoryPage,
  ProductSummary,
} from "./types";

export const PRODUCT_TILE =
  "slug, name, subtitle, sort_order, product_media(role, sort_order, media(storage_path, width, height, alt_text))";

export function toProductSummaries(
  rows: readonly {
    slug: string;
    name: string;
    subtitle: string | null;
    sort_order: number;
    product_media: Parameters<typeof pickThumbnail>[0];
  }[]
): ProductSummary[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de")
    )
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      subtitle: p.subtitle,
      thumbnail: pickThumbnail(p.product_media),
    }));
}

export function listCategories(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategoryListItem[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select("slug, name, product(slug)")
      .order("sort_order")
      .order("name");
    if (error) return err(toDbError(error));
    // RLS limits `product` to published rows for anon.
    return ok(
      data.map((c) => ({
        slug: c.slug,
        name: c.name,
        productCount: c.product.length,
      }))
    );
  });
}

export function getCategoryPage(
  slug: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategoryPage, CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select(
        `slug, name, intro_text, seo_title, seo_description, product(${PRODUCT_TILE})`
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) return err(toDbError(error));
    if (!data) return err({ kind: "not_found" });

    // RLS already limits `product` to published rows for anon.
    const products = toProductSummaries(data.product);

    return ok({
      slug: data.slug,
      name: data.name,
      introText: data.intro_text,
      seoTitle: data.seo_title,
      seoDescription: data.seo_description,
      products,
    });
  });
}

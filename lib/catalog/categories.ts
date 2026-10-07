import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError, CategoryPage, CategorySummary } from "./types";

export function listCategories(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategorySummary[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select("slug, name")
      .order("sort_order")
      .order("name");
    if (error) return err(toDbError(error));
    return ok(data);
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
        "slug, name, intro_text, seo_title, seo_description, product(slug, name, subtitle, sort_order)"
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) return err(toDbError(error));
    if (!data) return err({ kind: "not_found" });

    // RLS already limits `product` to published rows for anon.
    const products = [...data.product]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de")
      )
      .map(({ slug, name, subtitle }) => ({ slug, name, subtitle }));

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

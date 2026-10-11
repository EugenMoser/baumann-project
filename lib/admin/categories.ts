import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import type { CategoryInput, CategoryValues } from "./category-schema";
import {
  CATEGORY_IN_USE,
  fromPg,
  STALE_SELECTION,
  type AdminError,
} from "./errors";

export type CategoryListItem = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  productCount: number;
};

const countOf = (embed: unknown): number => {
  if (!Array.isArray(embed)) return 0;
  const row: unknown = embed[0];
  return typeof row === "object" &&
    row !== null &&
    "count" in row &&
    typeof row.count === "number"
    ? row.count
    : 0;
};

export async function listCategories(
  client: AdminClient
): Promise<Result<CategoryListItem[], AdminError>> {
  const { data, error } = await client
    .from("category")
    .select("id, name, slug, sort_order, product(count)")
    .order("sort_order")
    .order("name");
  if (error) return err(fromPg(error));
  return ok(
    data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sortOrder: c.sort_order,
      productCount: countOf(c.product),
    }))
  );
}

export async function getCategory(
  client: AdminClient,
  id: number
): Promise<
  Result<
    { id: number; productCount: number; values: CategoryValues },
    AdminError
  >
> {
  const { data, error } = await client
    .from("category")
    .select(
      "id, name, slug, intro_text, seo_title, seo_description, sort_order, product(count), category_attribute(attribute_id, sort_order)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return err(fromPg(error));
  if (data === null) return err({ kind: "not_found" });
  return ok({
    id: data.id,
    productCount: countOf(data.product),
    values: {
      name: data.name,
      slug: data.slug,
      introText: data.intro_text,
      seoTitle: data.seo_title ?? "",
      seoDescription: data.seo_description ?? "",
      sortOrder: String(data.sort_order),
      attributes: [...data.category_attribute]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => ({
          attributeId: String(a.attribute_id),
          sortOrder: String(a.sort_order),
        })),
    },
  });
}

export async function saveCategory(
  client: AdminClient,
  id: number | null,
  input: CategoryInput
): Promise<Result<{ id: number }, AdminError>> {
  const { data, error } = await client.rpc("admin_save_category", {
    payload: {
      ...(id === null ? {} : { id }),
      name: input.name,
      slug: input.slug,
      intro_text: input.introText,
      seo_title: input.seoTitle,
      seo_description: input.seoDescription,
      sort_order: input.sortOrder,
      attributes: input.attributes.map((a) => ({
        attribute_id: a.attributeId,
        sort_order: a.sortOrder,
      })),
    },
  });
  if (error)
    return err(fromPg(error, { category_slug_key: "slug" }, STALE_SELECTION));
  return ok({ id: data });
}

export async function deleteCategory(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("category")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, CATEGORY_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

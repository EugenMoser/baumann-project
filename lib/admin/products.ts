import type { ContentOrigin } from "@/lib/catalog/types";
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, STALE_SELECTION, type AdminError } from "./errors";
import { likePattern, type ProductFilter } from "./filter";
import type { ProductStatus } from "./labels";
import { productOrigins } from "./origin";
import {
  DELETE_PUBLISHED,
  PUBLISH_NEEDS_ARTICLE,
  publishProblem,
  type PublishStats,
} from "./product-rules";
import type { ProductInput, ProductValues } from "./schemas";

export type ProductListItem = {
  id: number;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryName: string;
  categorySlug: string;
  articleCount: number;
  updatedAt: string;
};

export type AttributeOption = {
  id: number;
  key: string;
  label: string;
  unit: string | null;
  dataType: "decimal" | "text";
  sortOrder: number;
};

export type EditorOptions = {
  categories: { id: number; name: string }[];
  materials: { id: number; code: string; name: string }[];
  colors: { id: number; name: string; hexCode: string }[];
  attributes: AttributeOption[];
};

export type ArticleEditItem = {
  id: number;
  articleNumber: string;
  name: string | null;
  description: string | null;
  note: string | null;
  materialId: number | null;
  materialNote: string | null;
  sortOrder: number;
  attributes: {
    attributeId: number;
    valueDecimal: number | null;
    valueText: string | null;
  }[];
  packaging: { quantity: number; label: string | null }[];
};

export type ColorAssignment = {
  colorId: number;
  suffix: string | null;
  isDefault: boolean;
  sortOrder: number;
};

export type ProductEditor = {
  product: {
    id: number;
    categoryId: number;
    categorySlug: string;
    name: string;
    slug: string;
    subtitle: string | null;
    description: string | null;
    materialId: number | null;
    materialNote: string | null;
    status: ProductStatus;
    sortOrder: number;
    seoTitle: string | null;
    seoDescription: string | null;
    descriptionOrigin: ContentOrigin;
    seoOrigin: ContentOrigin;
  };
  articles: ArticleEditItem[];
  colors: ColorAssignment[];
  categoryAttributeIds: number[];
};

const PRODUCT_CONFLICTS = { product_category_id_slug_key: "slug" };

// Aggregate embeds come back as [{ count }]; read defensively.
function countOf(embed: unknown): number {
  if (!Array.isArray(embed)) return 0;
  const row: unknown = embed[0];
  if (typeof row === "object" && row !== null && "count" in row) {
    return typeof row.count === "number" ? row.count : 0;
  }
  return 0;
}

export async function listProducts(
  client: AdminClient,
  filter: ProductFilter
): Promise<Result<ProductListItem[], AdminError>> {
  let ids: number[] | null = null;
  if (filter.q !== null) {
    const pattern = likePattern(filter.q);
    const [byName, byNumber] = await Promise.all([
      client.from("product").select("id").ilike("name", pattern),
      client
        .from("article")
        .select("product_id")
        .ilike("article_number", pattern),
    ]);
    if (byName.error) return err(fromPg(byName.error));
    if (byNumber.error) return err(fromPg(byNumber.error));
    ids = [
      ...new Set([
        ...byName.data.map((r) => r.id),
        ...byNumber.data.map((r) => r.product_id),
      ]),
    ];
    if (ids.length === 0) return ok([]);
  }
  let query = client
    .from("product")
    .select(
      "id, name, slug, status, sort_order, updated_at, category!inner(name, slug, sort_order), article!article_product_id_fkey(count)"
    );
  if (filter.categoryId !== null)
    query = query.eq("category_id", filter.categoryId);
  if (filter.status !== null) query = query.eq("status", filter.status);
  if (ids !== null) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) return err(fromPg(error));
  const sorted = [...data].sort(
    (a, b) =>
      a.category.sort_order - b.category.sort_order ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, "de")
  );
  return ok(
    sorted.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      categoryName: p.category.name,
      categorySlug: p.category.slug,
      articleCount: countOf(p.article),
      updatedAt: p.updated_at,
    }))
  );
}

export async function loadEditorOptions(
  client: AdminClient
): Promise<Result<EditorOptions, AdminError>> {
  const [categories, materials, colors, attributes] = await Promise.all([
    client.from("category").select("id, name").order("sort_order"),
    client.from("material").select("id, code, name").order("code"),
    client.from("color").select("id, name, hex_code").order("name"),
    client
      .from("attribute")
      .select("id, key, label, unit, data_type, sort_order")
      .order("sort_order"),
  ]);
  if (categories.error) return err(fromPg(categories.error));
  if (materials.error) return err(fromPg(materials.error));
  if (colors.error) return err(fromPg(colors.error));
  if (attributes.error) return err(fromPg(attributes.error));
  return ok({
    categories: categories.data,
    materials: materials.data,
    colors: colors.data.map((c) => ({
      id: c.id,
      name: c.name,
      hexCode: c.hex_code,
    })),
    attributes: attributes.data.map((a) => ({
      id: a.id,
      key: a.key,
      label: a.label,
      unit: a.unit,
      dataType: a.data_type,
      sortOrder: a.sort_order,
    })),
  });
}

export async function getProductEditor(
  client: AdminClient,
  id: number
): Promise<Result<ProductEditor, AdminError>> {
  const { data, error } = await client
    .from("product")
    .select(
      `id, category_id, name, slug, subtitle, description, material_id, material_note, status, sort_order,
      seo_title, seo_description, description_origin, seo_origin,
      category!inner(slug, category_attribute(attribute_id)),
      article!article_product_id_fkey(id, article_number, name, description, note, material_id, material_note, sort_order,
        article_attribute(attribute_id, value_decimal, value_text),
        article_packaging(quantity, label, sort_order)),
      product_color(color_id, suffix, is_default, sort_order)`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return err(fromPg(error));
  if (data === null) return err({ kind: "not_found" });
  return ok({
    product: {
      id: data.id,
      categoryId: data.category_id,
      categorySlug: data.category.slug,
      name: data.name,
      slug: data.slug,
      subtitle: data.subtitle,
      description: data.description,
      materialId: data.material_id,
      materialNote: data.material_note,
      status: data.status,
      sortOrder: data.sort_order,
      seoTitle: data.seo_title,
      seoDescription: data.seo_description,
      descriptionOrigin: data.description_origin,
      seoOrigin: data.seo_origin,
    },
    articles: [...data.article]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.article_number.localeCompare(b.article_number)
      )
      .map((a) => ({
        id: a.id,
        articleNumber: a.article_number,
        name: a.name,
        description: a.description,
        note: a.note,
        materialId: a.material_id,
        materialNote: a.material_note,
        sortOrder: a.sort_order,
        attributes: a.article_attribute.map((x) => ({
          attributeId: x.attribute_id,
          valueDecimal: x.value_decimal,
          valueText: x.value_text,
        })),
        packaging: [...a.article_packaging]
          .sort((x, y) => x.sort_order - y.sort_order)
          .map((x) => ({ quantity: x.quantity, label: x.label })),
      })),
    colors: [...data.product_color]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        colorId: c.color_id,
        suffix: c.suffix,
        isDefault: c.is_default,
        sortOrder: c.sort_order,
      })),
    categoryAttributeIds: data.category.category_attribute.map(
      (c) => c.attribute_id
    ),
  });
}

export function toProductValues(
  product: ProductEditor["product"]
): ProductValues {
  return {
    categoryId: String(product.categoryId),
    name: product.name,
    slug: product.slug,
    subtitle: product.subtitle ?? "",
    description: product.description ?? "",
    materialId: product.materialId === null ? "" : String(product.materialId),
    materialNote: product.materialNote ?? "",
    status: product.status,
    sortOrder: String(product.sortOrder),
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
  };
}

export async function publishStats(
  client: AdminClient,
  productId: number
): Promise<Result<PublishStats, AdminError>> {
  const [articles, colors] = await Promise.all([
    client
      .from("article")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    client
      .from("product_color")
      .select("is_default")
      .eq("product_id", productId),
  ]);
  if (articles.error) return err(fromPg(articles.error));
  if (colors.error) return err(fromPg(colors.error));
  return ok({
    articleCount: articles.count ?? 0,
    colorCount: colors.data.length,
    defaultColorCount: colors.data.filter((r) => r.is_default).length,
  });
}

export async function saveProduct(
  client: AdminClient,
  id: number | null,
  input: ProductInput
): Promise<Result<{ id: number }, AdminError>> {
  const fields = {
    category_id: input.categoryId,
    name: input.name,
    slug: input.slug,
    subtitle: input.subtitle,
    description: input.description,
    material_id: input.materialId,
    material_note: input.materialNote,
    status: input.status,
    sort_order: input.sortOrder,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
  };
  const next = {
    description: input.description,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };

  if (id === null) {
    if (input.status === "published")
      return err({ kind: "invalid", message: PUBLISH_NEEDS_ARTICLE });
    const { data, error } = await client
      .from("product")
      .insert({ ...fields, ...productOrigins(null, next) })
      .select("id")
      .single();
    if (error) return err(fromPg(error, PRODUCT_CONFLICTS, STALE_SELECTION));
    return ok({ id: data.id });
  }

  const { data: prev, error: prevError } = await client
    .from("product")
    .select(
      "description, seo_title, seo_description, description_origin, seo_origin"
    )
    .eq("id", id)
    .maybeSingle();
  if (prevError) return err(fromPg(prevError));
  if (prev === null) return err({ kind: "not_found" });
  if (input.status === "published") {
    const stats = await publishStats(client, id);
    if (!stats.ok) return stats;
    const problem = publishProblem(stats.value);
    if (problem) return err({ kind: "invalid", message: problem });
  }
  const origins = productOrigins(
    {
      description: prev.description,
      seoTitle: prev.seo_title,
      seoDescription: prev.seo_description,
      descriptionOrigin: prev.description_origin,
      seoOrigin: prev.seo_origin,
    },
    next
  );
  const { data, error } = await client
    .from("product")
    .update({ ...fields, ...origins })
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, PRODUCT_CONFLICTS, STALE_SELECTION));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok({ id });
}

export async function deleteProduct(
  client: AdminClient,
  id: number
): Promise<Result<string[], AdminError>> {
  const { data: row, error: readError } = await client
    .from("product")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return err(fromPg(readError));
  if (row === null) return err({ kind: "not_found" });
  if (row.status === "published")
    return err({ kind: "invalid", message: DELETE_PUBLISHED });
  // D5: product, its rows and its media rows in one transaction; returns
  // the storage paths the caller removes afterwards.
  const { data, error } = await client.rpc("admin_delete_product", {
    p_product_id: id,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}

import { firstFreeSlug, slugBase } from "@/lib/catalog/slug";
import type { ContentOrigin } from "@/lib/catalog/types";
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import {
  AI_SUGGESTION_EXPIRED,
  fromPg,
  STALE_SELECTION,
  type AdminError,
} from "./errors";
import { needsAltReview } from "./alt-review";
import { likePattern, type ProductFilter } from "./filter";
import type { ProductStatus } from "./labels";
import { productOrigins, type AcceptedText } from "./origin";
import {
  DELETE_PUBLISHED,
  PUBLISH_NEEDS_ARTICLE,
  publishProblem,
  type PublishStats,
} from "./product-rules";
import type { ProductInput, ProductValues } from "./schemas";
import { takenProductSlugs, withSlugRetry } from "./slugs";

export type ProductListItem = {
  id: number;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryName: string;
  categorySlug: string;
  articleCount: number;
  updatedAt: string;
  altReview: boolean;
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
      "id, name, slug, status, sort_order, updated_at, category!inner(name, slug, sort_order), article!article_product_id_fkey(count), product_media(media(alt_text))"
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
  const items = sorted.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    categoryName: p.category.name,
    categorySlug: p.category.slug,
    articleCount: countOf(p.article),
    updatedAt: p.updated_at,
    altReview: needsAltReview(
      p.name,
      p.product_media.map((m) => m.media.alt_text)
    ),
  }));
  return ok(filter.altReview ? items.filter((i) => i.altReview) : items);
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

// Ids of the AI suggestions the admin accepted in the editor (hidden fields).
export type AcceptedIds = {
  description: number | null;
  seoTitle: number | null;
  seoDescription: number | null;
};

const SUGGESTION_MAX_AGE_MS = 24 * 3_600_000;
const SUGGESTION_FIELDS = [
  { key: "description", field: "description" },
  { key: "seoTitle", field: "seo_title" },
  { key: "seoDescription", field: "seo_description" },
] as const;

// D6: an id counts only for this product and field, within 24 h and once.
// The database applies every condition; an id that fails any of them rejects
// the whole save (AI_SUGGESTION_EXPIRED), so AI text is never saved as human.
// A field saved empty keeps no AI text: its id is skipped, so it neither
// counts toward the origin nor gets marked accepted.
async function loadAccepted(
  client: AdminClient,
  productId: number,
  ids: AcceptedIds,
  saved: Record<(typeof SUGGESTION_FIELDS)[number]["key"], string | null>
): Promise<Result<{ text: AcceptedText; rowIds: number[] }, AdminError>> {
  const since = new Date(Date.now() - SUGGESTION_MAX_AGE_MS).toISOString();
  const text: AcceptedText = {};
  const rowIds: number[] = [];
  for (const { key, field } of SUGGESTION_FIELDS) {
    const rowId = ids[key];
    if (rowId === null || saved[key] === null) continue;
    const { data, error } = await client
      .from("ai_generation")
      .select("output")
      .eq("id", rowId)
      .eq("entity", "product")
      .eq("entity_id", productId)
      .eq("field", field)
      .gt("created_at", since)
      .is("accepted_at", null)
      .maybeSingle();
    if (error) return err(fromPg(error));
    if (data === null)
      return err({ kind: "invalid", message: AI_SUGGESTION_EXPIRED });
    text[key] = data.output;
    rowIds.push(rowId);
  }
  return ok({ text, rowIds });
}

// After the product update; a failure here must not fail the save.
async function markAccepted(client: AdminClient, rowIds: number[]) {
  if (rowIds.length === 0) return;
  const { error } = await client
    .from("ai_generation")
    .update({ accepted_at: new Date().toISOString() })
    .in("id", rowIds)
    .is("accepted_at", null);
  if (error)
    console.error(
      "[admin] mark AI suggestions accepted",
      error.code ?? "unknown"
    );
}

export async function saveProduct(
  client: AdminClient,
  id: number | null,
  input: ProductInput,
  accepted?: AcceptedIds
): Promise<Result<{ id: number }, AdminError>> {
  const fields = {
    category_id: input.categoryId,
    name: input.name,
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
    const base = slugBase(input.name);
    return withSlugRetry(async () => {
      const taken = await takenProductSlugs(
        client,
        input.categoryId,
        base,
        null
      );
      if (!taken.ok) return taken;
      const { data, error } = await client
        .from("product")
        .insert({
          ...fields,
          slug: firstFreeSlug(base, taken.value),
          ...productOrigins(null, next),
        })
        .select("id")
        .single();
      if (error) return err(fromPg(error, PRODUCT_CONFLICTS, STALE_SELECTION));
      return ok({ id: data.id });
    });
  }

  const { data: prev, error: prevError } = await client
    .from("product")
    .select(
      "category_id, slug, description, seo_title, seo_description, description_origin, seo_origin"
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
  const acceptedRows = accepted
    ? await loadAccepted(client, id, accepted, next)
    : ok({ text: {}, rowIds: [] });
  if (!acceptedRows.ok) return acceptedRows;
  const origins = productOrigins(
    {
      description: prev.description,
      seoTitle: prev.seo_title,
      seoDescription: prev.seo_description,
      descriptionOrigin: prev.description_origin,
      seoOrigin: prev.seo_origin,
    },
    next,
    acceptedRows.value.text
  );
  // The slug is never rewritten, except to keep it unique when the product
  // moves to another category (6c D1).
  const update = async (
    slug: string | null
  ): Promise<Result<{ id: number }, AdminError>> => {
    const { data, error } = await client
      .from("product")
      .update({
        ...fields,
        ...(slug === null ? {} : { slug }),
        ...origins,
      })
      .eq("id", id)
      .select("id");
    if (error) return err(fromPg(error, PRODUCT_CONFLICTS, STALE_SELECTION));
    if (data.length === 0) return err({ kind: "not_found" });
    return ok({ id });
  };
  const saved =
    prev.category_id === input.categoryId
      ? await update(null)
      : await withSlugRetry(async () => {
          const taken = await takenProductSlugs(
            client,
            input.categoryId,
            prev.slug,
            id
          );
          if (!taken.ok) return taken;
          return update(
            taken.value.includes(prev.slug)
              ? firstFreeSlug(prev.slug, taken.value)
              : prev.slug
          );
        });
  if (saved.ok) await markAccepted(client, acceptedRows.value.rowIds);
  return saved;
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

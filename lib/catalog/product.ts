import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { PRODUCT_TILE, toProductSummaries } from "./categories";
import { guard, toDbError } from "./errors";
import { pickThumbnail } from "./media";
import { selectRelated } from "./related";
import type {
  ArticleView,
  CatalogError,
  MediaView,
  ProductPage,
} from "./types";

// `!article_product_id_fkey` disambiguates article ↔ product: there is a direct
// foreign key and the product_accessory junction.
const PRODUCT_SELECT = `
  id, category_id, slug, name, subtitle, description, description_origin,
  seo_title, seo_description, seo_origin, material_note,
  category!inner(slug, name),
  material(code, name),
  article!article_product_id_fkey(
    article_number, name, description, note, material_note, sort_order,
    material(code, name),
    article_attribute(value_decimal, value_text, attribute(key, label, unit, sort_order)),
    article_packaging(quantity, label, sort_order)
  ),
  product_color(suffix, is_default, sort_order, color(id, name, ral_reference, hex_code, family)),
  product_media(role, sort_order, media(storage_path, width, height, alt_text, alt_origin)),
  product_accessory(sort_order, article(article_number, name, product!article_product_id_fkey(slug, name, category(slug))))
`;

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

export function getProductPage(
  categorySlug: string,
  productSlug: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<ProductPage, CatalogError>> {
  return guard(async () => {
    const { data: row, error } = await client
      .from("product")
      .select(PRODUCT_SELECT)
      .eq("slug", productSlug)
      .eq("category.slug", categorySlug)
      .maybeSingle();
    if (error) return err(toDbError(error));
    if (!row) return err({ kind: "not_found" });

    const { data: variants, error: variantError } = await client
      .from("variant")
      .select("order_number, article_number, suffix, is_default, color_id")
      .eq("product_id", row.id)
      .order("article_sort_order")
      .order("color_sort_order", { nullsFirst: true });
    if (variantError) return err(toDbError(variantError));

    const { data: siblings, error: siblingError } = await client
      .from("product")
      .select(PRODUCT_TILE)
      .eq("category_id", row.category_id);
    if (siblingError) return err(toDbError(siblingError));
    const related = selectRelated(toProductSummaries(siblings), row.slug);

    const articles: ArticleView[] = [...row.article]
      .sort(bySortOrder)
      .map((a) => ({
        articleNumber: a.article_number,
        name: a.name,
        description: a.description,
        note: a.note,
        material: a.material,
        materialNote: a.material_note,
        attributes: [...a.article_attribute]
          .sort((x, y) => x.attribute.sort_order - y.attribute.sort_order)
          .map((v) => ({
            key: v.attribute.key,
            label: v.attribute.label,
            unit: v.attribute.unit,
            value: v.value_decimal ?? v.value_text ?? "",
            sortOrder: v.attribute.sort_order,
          })),
        packaging: [...a.article_packaging]
          .sort(bySortOrder)
          .map(({ quantity, label }) => ({ quantity, label })),
      }));

    return ok({
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle,
      description: row.description,
      descriptionOrigin: row.description_origin,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      seoOrigin: row.seo_origin,
      category: row.category,
      material: row.material,
      materialNote: row.material_note,
      articles,
      thumbnail: pickThumbnail(row.product_media),
      colors: [...row.product_color].sort(bySortOrder).map((c) => ({
        id: c.color.id,
        name: c.color.name,
        ralReference: c.color.ral_reference,
        hexCode: c.color.hex_code,
        family: c.color.family,
        suffix: c.suffix,
        isDefault: c.is_default,
      })),
      variants: variants.flatMap((v) =>
        v.order_number === null || v.article_number === null
          ? []
          : [
              {
                orderNumber: v.order_number,
                articleNumber: v.article_number,
                suffix: v.suffix,
                isDefault: v.is_default ?? false,
                colorId: v.color_id,
              },
            ]
      ),
      media: [...row.product_media]
        .sort((a, b) =>
          a.role === b.role
            ? a.sort_order - b.sort_order
            : a.role === "thumbnail"
              ? -1
              : 1
        )
        .map((m): MediaView => ({
          storagePath: m.media.storage_path,
          width: m.media.width,
          height: m.media.height,
          altText: m.media.alt_text,
          altOrigin: m.media.alt_origin,
          role: m.role,
        })),
      accessories: [...row.product_accessory].sort(bySortOrder).map((acc) => ({
        articleNumber: acc.article.article_number,
        name: acc.article.name,
        productSlug: acc.article.product.slug,
        productName: acc.article.product.name,
        categorySlug: acc.article.product.category.slug,
      })),
      related,
    });
  });
}

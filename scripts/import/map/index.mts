import { CATEGORIES } from "../categories.mts";
import type { Finding, MapError } from "../findings.mts";
import type {
  ImportPayload,
  PayloadCategoryAttribute,
  PayloadMedia,
} from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { Snapshot } from "../snapshot.mts";
import { mapArticles } from "./articles.mts";
import { ATTRIBUTES } from "./attributes.mts";
import { mapColors } from "./colors.mts";
import { MATERIALS } from "./materials.mts";
import { mapMedia, type MediaDraft } from "./media.mts";
import { mapProducts } from "./products.mts";

export type CatalogStats = {
  products: number;
  articles: number;
  accessories: number;
  colors: number;
  materials: number;
  attributes: number;
  images: number;
  fragments: number;
  typedFragments: number;
};
export type MappedCatalog = {
  payload: Omit<ImportPayload, "media">;
  media: MediaDraft[];
  findings: Finding[];
  stats: CatalogStats;
};
export type Dimensions = { width: number; height: number };

export function mapSnapshot(
  snapshot: Snapshot,
  options: { imageBaseUrl: string }
): Result<MappedCatalog, MapError> {
  const products = mapProducts(snapshot.products);
  if (!products.ok) return products;
  const rows = products.value.products;
  const articles = mapArticles(snapshot.articles, rows);
  if (!articles.ok) return articles;
  const colors = mapColors(
    snapshot.colors,
    snapshot.product_colors_connection,
    new Set(rows.map((p) => p.legacy_product_id))
  );
  if (!colors.ok) return colors;
  const media = mapMedia(snapshot.products, rows, options.imageBaseUrl);
  if (!media.ok) return media;

  const usedCodes = new Set(
    rows.map((p) => p.material_code).filter((c): c is string => c !== null)
  );
  const materials = MATERIALS.filter((m) => usedCodes.has(m.code)).sort(
    (a, b) => a.code.localeCompare(b.code)
  );
  const usedKeys = new Set(articles.value.article_attributes.map((a) => a.key));
  const attributes = ATTRIBUTES.filter((a) => usedKeys.has(a.key));

  const categoryOf = new Map(
    rows.map((p) => [p.legacy_product_id, p.category_slug])
  );
  const productOf = new Map(
    articles.value.articles.map((a) => [a.article_number, a.legacy_product_id])
  );
  const sortOf = new Map(ATTRIBUTES.map((a) => [a.key, a.sort_order]));
  const pairs = new Map<string, PayloadCategoryAttribute>();
  for (const value of articles.value.article_attributes) {
    const category = categoryOf.get(productOf.get(value.article_number) ?? -1);
    if (category === undefined) continue;
    pairs.set(`${category}|${value.key}`, {
      category_slug: category,
      attribute_key: value.key,
      sort_order: sortOf.get(value.key) ?? 0,
    });
  }
  const category_attributes = [...pairs.values()].sort(
    (a, b) =>
      a.category_slug.localeCompare(b.category_slug) ||
      a.sort_order - b.sort_order
  );

  return ok({
    payload: {
      categories: [...CATEGORIES],
      materials,
      attributes,
      category_attributes,
      colors: colors.value.colors,
      products: rows,
      articles: articles.value.articles,
      article_attributes: articles.value.article_attributes,
      article_packaging: articles.value.article_packaging,
      product_colors: colors.value.product_colors,
      product_media: media.value.product_media,
      product_accessories: articles.value.product_accessories,
    },
    media: media.value.media,
    findings: [
      ...products.value.findings,
      ...articles.value.findings,
      ...colors.value.findings,
      ...media.value.findings,
    ],
    stats: {
      products: rows.length,
      articles: articles.value.articles.length,
      accessories: articles.value.product_accessories.length,
      colors: colors.value.colors.length,
      materials: materials.length,
      attributes: attributes.length,
      images: media.value.media.length,
      fragments: articles.value.fragments.total,
      typedFragments: articles.value.fragments.typed,
    },
  });
}

export function completePayload(
  mapped: MappedCatalog,
  dimensions: ReadonlyMap<string, Dimensions>
): Result<ImportPayload, MapError> {
  const media: PayloadMedia[] = [];
  for (const m of mapped.media) {
    const size = dimensions.get(m.storage_path);
    if (size === undefined)
      return err({
        kind: "invalid_data",
        message: `no dimensions for ${m.storage_path}`,
      });
    media.push({
      storage_path: m.storage_path,
      width: size.width,
      height: size.height,
      alt_text: m.alt_text,
    });
  }
  return ok({ ...mapped.payload, media });
}

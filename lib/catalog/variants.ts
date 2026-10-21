import type { ArticleView, ProductPage } from "./types";

export type ColorOption = {
  key: string;
  name: string;
  ralReference: string | null;
  hexCode: string;
  suffix: string | null;
};

export type VariantMatrix = {
  options: ColorOption[];
  defaultKey: string | null;
  byArticle: Record<
    string,
    { numbers: Record<string, string>; fallback: string }
  >;
};

const colorKey = (id: number) => `color-${id}`;

// D6: per article, the order number for each colour; `fallback` is what the
// server renders (default colour, or the bare article number).
export function buildVariantMatrix(
  page: Pick<ProductPage, "colors" | "variants" | "articles">
): VariantMatrix {
  const options = page.colors.map((c) => ({
    key: colorKey(c.id),
    name: c.name,
    ralReference: c.ralReference,
    hexCode: c.hexCode,
    suffix: c.suffix,
  }));
  const defaultColor = page.colors.find((c) => c.isDefault) ?? page.colors[0];
  const defaultKey = defaultColor ? colorKey(defaultColor.id) : null;

  const byArticle: VariantMatrix["byArticle"] = {};
  for (const article of page.articles) {
    const numbers: Record<string, string> = {};
    for (const v of page.variants) {
      if (v.articleNumber === article.articleNumber && v.colorId !== null) {
        numbers[colorKey(v.colorId)] = v.orderNumber;
      }
    }
    const fallback =
      (defaultKey && numbers[defaultKey]) ?? article.articleNumber;
    byArticle[article.articleNumber] = { numbers, fallback };
  }
  return { options, defaultKey, byArticle };
}

// D4: order numbers for the product order box; per colour the number of the
// first article (table order) that has one.
export function orderBoxNumbers(
  matrix: VariantMatrix,
  articles: ArticleView[]
): { numbers: Record<string, string>; fallback: string } | null {
  if (articles.length === 0) return null;
  const numbers: Record<string, string> = {};
  for (const article of articles) {
    const entry = matrix.byArticle[article.articleNumber];
    if (!entry) continue;
    for (const [key, orderNumber] of Object.entries(entry.numbers)) {
      numbers[key] ??= orderNumber;
    }
  }
  const first = articles[0];
  const fallback =
    matrix.byArticle[first.articleNumber]?.fallback ?? first.articleNumber;
  return { numbers, fallback };
}

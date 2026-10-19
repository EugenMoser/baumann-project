import type { ArticleAttributeView, ArticleView } from "./types";

export type AttributeSummary = { key: string; label: string; text: string };

export type AttributeColumn = {
  key: string;
  label: string;
  unit: string | null;
  numeric: boolean;
};

const MAX_LISTED_VALUES = 6;
const numberFormat = new Intl.NumberFormat("de-DE");

// Attributes grouped by key in first-seen order over articles in table order.
function groupByKey(
  articles: ArticleView[]
): Map<string, ArticleAttributeView[]> {
  const groups = new Map<string, ArticleAttributeView[]>();
  for (const article of articles) {
    for (const attr of article.attributes) {
      const group = groups.get(attr.key);
      if (group) group.push(attr);
      else groups.set(attr.key, [attr]);
    }
  }
  return groups;
}

// D4: compact per-product summary of article attributes (list view).
export function summarizeAttributes(
  articles: ArticleView[],
  max = 4
): AttributeSummary[] {
  const result: AttributeSummary[] = [];
  for (const [key, attrs] of groupByKey(articles)) {
    if (result.length >= max) break;
    const values = [...new Set(attrs.map((a) => a.value))];
    const unit = attrs[0].unit;
    const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);

    const numbers = values.filter((v) => typeof v === "number");
    let text: string;
    if (numbers.length === values.length) {
      const sorted = numbers.toSorted((a, b) => a - b);
      text =
        sorted.length > MAX_LISTED_VALUES
          ? withUnit(
              `${numberFormat.format(sorted[0])} – ${numberFormat.format(sorted[sorted.length - 1])}`
            )
          : withUnit(sorted.map((v) => numberFormat.format(v)).join(" / "));
    } else {
      if (values.length > MAX_LISTED_VALUES) continue;
      text = withUnit(
        values
          .map((v) => (typeof v === "number" ? numberFormat.format(v) : v))
          .join(" / ")
      );
    }
    result.push({ key, label: attrs[0].label, text });
  }
  return result;
}

// D4: one table column per attribute key; numeric only if every value is.
export function attributeColumns(articles: ArticleView[]): AttributeColumn[] {
  return [...groupByKey(articles)].map(([key, attrs]) => ({
    key,
    label: attrs[0].label,
    unit: attrs[0].unit,
    numeric: attrs.every((a) => typeof a.value === "number"),
  }));
}

import type { SearchHit } from "./types";

export function articleAnchorId(articleNumber: string): string {
  return `artikel-${articleNumber.trim().replace(/[\s/]+/g, "-")}`;
}

export function productPath(categorySlug: string, productSlug: string): string {
  return `/produkte/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productSlug)}`;
}

// D4: exactly one product and an exact number hit → straight to the article.
// Order numbers are "article number - suffix" (data model, view `variant`).
export function exactHitTarget(hits: readonly SearchHit[]): string | null {
  if (hits.length !== 1) return null;
  const [only] = hits;
  if (only.matchKind !== "exact_number" || only.matchedNumbers.length === 0)
    return null;
  const articleNumber = only.matchedNumbers[0].split(" - ")[0];
  return `${productPath(only.categorySlug, only.productSlug)}#${articleAnchorId(articleNumber)}`;
}

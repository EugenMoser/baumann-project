import type { ProductStatus } from "./labels";

export type PublishStats = {
  articleCount: number;
  colorCount: number;
  defaultColorCount: number;
};

export const PUBLISH_NEEDS_ARTICLE =
  "Zum Veröffentlichen braucht das Produkt mindestens einen Artikel.";
export const PUBLISH_NEEDS_DEFAULT =
  "Zum Veröffentlichen braucht das Produkt genau eine Standardfarbe.";
export const LAST_ARTICLE =
  "Ein veröffentlichtes Produkt braucht mindestens einen Artikel. Bitte zuerst archivieren.";
export const DELETE_PUBLISHED =
  "Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.";

// Spec D10 — mirrors import cross-check 9.
export function publishProblem(stats: PublishStats): string | null {
  if (stats.articleCount < 1) return PUBLISH_NEEDS_ARTICLE;
  if (stats.colorCount > 0 && stats.defaultColorCount !== 1)
    return PUBLISH_NEEDS_DEFAULT;
  return null;
}

export function lastArticleProblem(
  status: ProductStatus,
  articleCount: number
): string | null {
  return status === "published" && articleCount <= 1 ? LAST_ARTICLE : null;
}

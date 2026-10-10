import type { ContentOrigin } from "@/lib/catalog/types";

export type OriginFields = {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};
export type OriginSource = OriginFields & {
  descriptionOrigin: ContentOrigin;
  seoOrigin: ContentOrigin;
};

// Spec D7: editing AI text marks it ai_edited; human text stays human.
export function nextOrigin(
  prev: ContentOrigin,
  changed: boolean
): ContentOrigin {
  if (!changed) return prev;
  return prev === "human" ? "human" : "ai_edited";
}

export function productOrigins(
  prev: OriginSource | null,
  next: OriginFields
): { description_origin: ContentOrigin; seo_origin: ContentOrigin } {
  if (prev === null)
    return { description_origin: "human", seo_origin: "human" };
  return {
    description_origin: nextOrigin(
      prev.descriptionOrigin,
      prev.description !== next.description
    ),
    seo_origin: nextOrigin(
      prev.seoOrigin,
      prev.seoTitle !== next.seoTitle ||
        prev.seoDescription !== next.seoDescription
    ),
  };
}

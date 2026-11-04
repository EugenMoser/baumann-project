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

// Outputs of the valid accepted suggestions (D6); a key is absent when no
// valid id came with the save.
export type AcceptedText = {
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
};

// Browsers submit textarea line breaks as CRLF, the stored output has LF.
const normalise = (value: string): string =>
  value.replace(/\r\n/g, "\n").trim();
const sameText = (saved: string, output: string): boolean =>
  normalise(saved) === normalise(output);

// A field saved empty resets its origin to human (D6).
export function productOrigins(
  prev: OriginSource | null,
  next: OriginFields,
  accepted: AcceptedText = {}
): { description_origin: ContentOrigin; seo_origin: ContentOrigin } {
  if (prev === null)
    return { description_origin: "human", seo_origin: "human" };

  let descriptionOrigin: ContentOrigin;
  if (next.description === null) descriptionOrigin = "human";
  else if (accepted.description !== undefined)
    descriptionOrigin = sameText(next.description, accepted.description)
      ? "ai"
      : "ai_edited";
  else
    descriptionOrigin = nextOrigin(
      prev.descriptionOrigin,
      prev.description !== next.description
    );

  let seoOrigin: ContentOrigin;
  if (next.seoTitle === null && next.seoDescription === null)
    seoOrigin = "human";
  else if (
    accepted.seoTitle !== undefined ||
    accepted.seoDescription !== undefined
  ) {
    // Every non-empty SEO field must equal its accepted output; a field
    // without an accepted output is human text next to AI text.
    const unchanged = (saved: string | null, output: string | undefined) =>
      saved === null || (output !== undefined && sameText(saved, output));
    seoOrigin =
      unchanged(next.seoTitle, accepted.seoTitle) &&
      unchanged(next.seoDescription, accepted.seoDescription)
        ? "ai"
        : "ai_edited";
  } else
    seoOrigin = nextOrigin(
      prev.seoOrigin,
      prev.seoTitle !== next.seoTitle ||
        prev.seoDescription !== next.seoDescription
    );

  return { description_origin: descriptionOrigin, seo_origin: seoOrigin };
}

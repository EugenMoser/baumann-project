import type { ContentOrigin } from "@/lib/catalog/types";
import { NEEDS_ONE_THUMBNAIL } from "./errors";
import type { FieldErrors } from "./form";
import { MAX_ALT_TEXT } from "./image-check";
import type { MediaItem } from "./media";
import { nextOrigin } from "./origin";

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const ALT_REQUIRED = "Bitte einen Alt-Text eingeben.";
const ALT_TOO_LONG = `Höchstens ${MAX_ALT_TEXT} Zeichen.`;

function altError(text: string): string | null {
  const t = text.trim();
  if (t === "") return ALT_REQUIRED;
  if (t.length > MAX_ALT_TEXT) return ALT_TOO_LONG;
  return null;
}

export type UploadValues = { productId: string; altText: string };

export function readUpload(formData: FormData): {
  values: UploadValues;
  file: File | null;
} {
  const file = formData.get("file");
  return {
    values: {
      productId: str(formData.get("productId")),
      altText: str(formData.get("altText")),
    },
    // Browsers send an empty part when no file was chosen (Review Focus 1).
    file: file instanceof File && file.size > 0 ? file : null,
  };
}

export function parseUploadMeta(
  values: UploadValues
):
  | { ok: true; value: { productId: number; altText: string } }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const alt = altError(values.altText);
  if (alt) errors.altText = alt;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      productId: Number(values.productId),
      altText: values.altText.trim(),
    },
  };
}

export type MediaValues = {
  productId: string;
  rows: { mediaId: string; altText: string }[];
  thumbnailId: string;
};

export function readMediaForm(formData: FormData): MediaValues {
  const ids = formData.getAll("mediaId").map(str);
  const alts = formData.getAll("altText").map(str);
  return {
    productId: str(formData.get("productId")),
    rows: ids.map((mediaId, i) => ({ mediaId, altText: alts[i] ?? "" })),
    thumbnailId: str(formData.get("thumbnail")),
  };
}

export function parseMedia(values: MediaValues):
  | {
      ok: true;
      value: {
        productId: number;
        rows: { mediaId: number; altText: string; isThumbnail: boolean }[];
      };
    }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const rows = values.rows.map((row, i) => {
    if (!ID.test(row.mediaId)) errors.form = "Ungültige Anfrage.";
    const alt = altError(row.altText);
    if (alt) errors[`rows.${i}.altText`] = alt;
    return {
      mediaId: Number(row.mediaId),
      altText: row.altText.trim(),
      isThumbnail: row.mediaId === values.thumbnailId,
    };
  });
  if (rows.length > 0 && rows.filter((r) => r.isThumbnail).length !== 1)
    errors.media = NEEDS_ONE_THUMBNAIL;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { productId: Number(values.productId), rows } };
}

// D4: alt_origin per image follows the 6a origin rule.
export function withAltOrigins(
  current: MediaItem[],
  rows: { mediaId: number; altText: string; isThumbnail: boolean }[]
): {
  mediaId: number;
  altText: string;
  altOrigin: ContentOrigin;
  isThumbnail: boolean;
}[] {
  const byId = new Map(current.map((m) => [m.mediaId, m]));
  return rows.map((r) => {
    const prev = byId.get(r.mediaId);
    return {
      ...r,
      altOrigin: prev
        ? nextOrigin(prev.altOrigin, prev.altText !== r.altText)
        : "human",
    };
  });
}

export function mediaValuesFrom(
  productId: number,
  items: MediaItem[]
): MediaValues {
  return {
    productId: String(productId),
    rows: items.map((m) => ({
      mediaId: String(m.mediaId),
      altText: m.altText,
    })),
    thumbnailId: String(
      items.find((m) => m.isThumbnail)?.mediaId ?? items[0]?.mediaId ?? ""
    ),
  };
}

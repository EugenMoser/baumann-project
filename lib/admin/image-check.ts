import { imageSize } from "image-size";
import { err, ok, type Result } from "@/lib/result";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;
export const MAX_ALT_TEXT = 250;

export const IMAGE_MESSAGES = {
  missing: "Bitte eine Bilddatei wählen.",
  tooLarge: "Das Bild ist größer als 5 MB.",
  type: "Nur JPEG, PNG oder WebP.",
  dimensions: "Das Bild darf höchstens 8000 × 8000 Pixel groß sein.",
} as const;

export type CheckedImage = {
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
const isKnown = (t: string | undefined): t is keyof typeof TYPES =>
  t === "jpg" || t === "png" || t === "webp";

// D2: the type comes from the bytes; MIME type and file name are ignored.
export function checkImage(bytes: Uint8Array): Result<CheckedImage, string> {
  if (bytes.length === 0) return err(IMAGE_MESSAGES.missing);
  if (bytes.length > MAX_IMAGE_BYTES) return err(IMAGE_MESSAGES.tooLarge);
  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(bytes);
  } catch {
    return err(IMAGE_MESSAGES.type);
  }
  if (!isKnown(size.type)) return err(IMAGE_MESSAGES.type);
  const { width, height } = size;
  if (!width || !height || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE)
    return err(IMAGE_MESSAGES.dimensions);
  return ok({
    extension: size.type,
    contentType: TYPES[size.type],
    width,
    height,
  });
}

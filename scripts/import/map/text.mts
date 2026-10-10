export { slugify } from "../../../lib/catalog/slug.ts";

/** Trims and collapses all whitespace (incl. non-breaking spaces); blank → null. */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/** Like cleanText, but keeps line breaks between non-blank lines. */
export function cleanBlock(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter((line): line is string => line !== null);
  return lines.length === 0 ? null : lines.join("\n");
}

export function parseDecimal(raw: string): number {
  return Number(raw.replace(",", "."));
}

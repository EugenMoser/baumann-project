const GERMAN: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  ß: "ss",
};

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

export function slugify(value: string): string {
  return value
    .replace(/[äöüÄÖÜß]/g, (char) => GERMAN[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseDecimal(raw: string): number {
  return Number(raw.replace(",", "."));
}

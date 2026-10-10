const GERMAN: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  ß: "ss",
};

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .replace(/[äöüÄÖÜß]/g, (char) => GERMAN[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

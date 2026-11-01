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

const SLUG_BASE_MAX = 120;

/**
 * Slug of a name for a new record: `slugify`, cut to at most 120 characters
 * at a hyphen where possible (hard cut for one long word), never ending in "-".
 */
export function slugBase(name: string): string {
  const slug = slugify(name);
  if (slug.length <= SLUG_BASE_MAX) return slug;
  const head = slug.slice(0, SLUG_BASE_MAX);
  if (slug[SLUG_BASE_MAX] === "-") return head;
  const cut = head.lastIndexOf("-");
  return cut > 0 ? head.slice(0, cut) : head;
}

/** `base` when free, else `base-n` for the smallest n >= 2 not taken. */
export function firstFreeSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

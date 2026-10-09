import type { Finding, MapError } from "../findings.mts";
import type { PayloadColor, PayloadProductColor } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotColor, SnapshotProductColor } from "../snapshot.mts";
import { cleanText } from "./text.mts";

// Legacy colour ids look like "<family>-<n>"; the prefix is the colour family.
export const COLOR_FAMILIES: Readonly<Record<string, string>> = {
  "0": "natur",
  "1": "weiß",
  "2": "schwarz",
  "3": "braun",
  "4": "grau",
  "5": "grün",
  "6": "blau",
  "8": "rot",
  "9": "orange",
  "10": "beige",
};

const invalid = (message: string): Result<never, MapError> =>
  err({ kind: "invalid_data", message });

export function splitColorName(raw: string): {
  name: string;
  ral_reference: string | null;
} {
  const text = cleanText(raw) ?? "";
  const match = /^(.*?)\s*\((ähnlich RAL [^)]+)\)$/.exec(text);
  return match
    ? { name: match[1], ral_reference: match[2] }
    : { name: text, ral_reference: null };
}

export function mapColors(
  colors: readonly SnapshotColor[],
  links: readonly SnapshotProductColor[],
  productIds: ReadonlySet<number>
): Result<
  {
    colors: PayloadColor[];
    product_colors: PayloadProductColor[];
    findings: Finding[];
  },
  MapError
> {
  const legacy = new Map(colors.map((c) => [c.color_id, c]));
  const canonical = new Map<
    string,
    PayloadColor & { legacyIds: Set<string> }
  >();
  const keyOf = new Map<string, string>();

  for (const l of links) {
    if (!productIds.has(l.product_id))
      return invalid(`colour link references unknown product ${l.product_id}`);
    const source = legacy.get(l.color_id);
    if (source === undefined)
      return invalid(
        `product ${l.product_id} references unknown colour ${l.color_id}`
      );
    if (keyOf.has(l.color_id)) continue;
    const prefix = l.color_id.split("-")[0] ?? "";
    const family = COLOR_FAMILIES[prefix];
    if (family === undefined)
      return invalid(
        `colour ${l.color_id} has unknown family prefix "${prefix}"`
      );
    const hex = source.code.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex))
      return invalid(
        `colour ${l.color_id} has invalid hex code "${source.code}"`
      );
    const { name, ral_reference } = splitColorName(source.name);
    if (name === "") return invalid(`colour ${l.color_id} has no name`);
    const key = `${name}|${hex}`;
    keyOf.set(l.color_id, key);
    const existing = canonical.get(key);
    if (existing) existing.legacyIds.add(l.color_id);
    else
      canonical.set(key, {
        name,
        ral_reference,
        hex_code: hex,
        family,
        legacyIds: new Set([l.color_id]),
      });
  }

  const findings: Finding[] = [];
  for (const c of canonical.values())
    if (c.legacyIds.size > 1)
      findings.push({
        kind: "merged_color",
        name: c.name,
        hex: c.hex_code,
        legacyColorIds: [...c.legacyIds].sort(),
      });

  const byProduct = new Map<number, SnapshotProductColor[]>();
  for (const l of links)
    byProduct.set(l.product_id, [...(byProduct.get(l.product_id) ?? []), l]);

  const product_colors: PayloadProductColor[] = [];
  for (const [productId, productLinks] of byProduct) {
    const sorted = [...productLinks].sort(
      (a, b) => a.color_suffix - b.color_suffix
    );
    const seen = new Set<string>();
    const rows = sorted.filter((l) => {
      const key = keyOf.get(l.color_id) ?? l.color_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const defaultIndex = Math.max(
      0,
      rows.findIndex((l) => l.color_suffix === 0)
    );
    rows.forEach((l, index) => {
      const c = canonical.get(keyOf.get(l.color_id) ?? "");
      if (c === undefined) return;
      product_colors.push({
        legacy_product_id: productId,
        color_name: c.name,
        color_hex: c.hex_code,
        suffix: String(l.color_suffix),
        is_default: index === defaultIndex,
        sort_order: index,
      });
    });
    const chosen = rows[defaultIndex];
    if (chosen !== undefined && chosen.color_suffix !== 0)
      findings.push({
        kind: "default_color_by_rule",
        legacyProductId: productId,
        suffix: String(chosen.color_suffix),
      });
  }

  const payloadColors = [...canonical.values()]
    .map(({ name, ral_reference, hex_code, family }) => ({
      name,
      ral_reference,
      hex_code,
      family,
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "de") ||
        a.hex_code.localeCompare(b.hex_code)
    );
  return ok({ colors: payloadColors, product_colors, findings });
}

import { CATEGORIES } from "../categories.mts";
import type { Finding, MapError } from "../findings.mts";
import type { PayloadProduct } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotProduct } from "../snapshot.mts";
import { splitMaterial } from "./materials.mts";
import { cleanBlock, cleanText, slugify } from "./text.mts";

type Draft = PayloadProduct & { level: "subtitle" | "legacy_id" | null };

const invalid = (message: string): Result<never, MapError> =>
  err({ kind: "invalid_data", message });

function collidingKeys(drafts: readonly Draft[]): Set<string> {
  const counts = new Map<string, number>();
  for (const d of drafts) {
    const key = `${d.category_slug}/${d.slug}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
}

function resolveSlugs(drafts: Draft[]): void {
  const first = collidingKeys(drafts);
  for (const d of drafts) {
    if (!first.has(`${d.category_slug}/${d.slug}`)) continue;
    if (d.subtitle !== null) {
      d.slug = slugify(`${d.name} ${d.subtitle}`);
      d.level = "subtitle";
    } else {
      d.slug = slugify(`${d.name} ${d.legacy_product_id}`);
      d.level = "legacy_id";
    }
  }
  const second = collidingKeys(drafts);
  for (const d of drafts) {
    if (!second.has(`${d.category_slug}/${d.slug}`)) continue;
    d.slug = slugify(`${d.name} ${d.legacy_product_id}`);
    d.level = "legacy_id";
  }
}

export function mapProducts(
  input: readonly SnapshotProduct[]
): Result<{ products: PayloadProduct[]; findings: Finding[] }, MapError> {
  const known = new Set(CATEGORIES.map((c) => c.slug));
  const seen = new Set<number>();
  const findings: Finding[] = [];
  const drafts: Draft[] = [];

  for (const p of input) {
    const id = p.product_id;
    if (seen.has(id)) return invalid(`duplicate product_id ${id}`);
    seen.add(id);

    const category = cleanText(p.category);
    if (category === null || !known.has(category))
      return invalid(`product ${id} has unknown category "${p.category}"`);
    const name = cleanText(p.name);
    if (name === null) return invalid(`product ${id} has no name`);
    const slug = slugify(name);
    if (slug === "")
      return invalid(`product ${id}: name "${name}" yields no slug`);

    const paragraphs = [p.description2, p.description3, p.description4]
      .map(cleanBlock)
      .filter((part): part is string => part !== null);
    const material = splitMaterial(p.material);
    if (material.fallback && material.note !== null)
      findings.push({
        kind: "material_fallback",
        legacyProductId: id,
        text: material.note,
      });

    drafts.push({
      legacy_product_id: id,
      category_slug: category,
      slug,
      name,
      subtitle: cleanText(p.description1),
      description: paragraphs.length > 0 ? paragraphs.join("\n\n") : null,
      material_code: material.code,
      material_note: material.note,
      sort_order: p.prio,
      level: null,
    });
  }

  resolveSlugs(drafts);
  if (collidingKeys(drafts).size > 0)
    return invalid(
      "product slugs are still not unique after collision handling"
    );

  const products: PayloadProduct[] = drafts.map(({ level, ...row }) => {
    if (level !== null)
      findings.push({
        kind: "slug_collision",
        legacyProductId: row.legacy_product_id,
        slug: row.slug,
        level,
      });
    return row;
  });
  return ok({ products, findings });
}

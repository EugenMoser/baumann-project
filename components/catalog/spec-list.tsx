import { summarizeAttributes } from "@/lib/catalog/attribute-summary";
import type { ArticleView, Material } from "@/lib/catalog/types";

type Spec = { key: string; term: string; value: string };

// D4: the product's material, else the distinct article materials.
function materialText(
  material: Material | null,
  materialNote: string | null,
  articles: ArticleView[]
): string {
  if (material) {
    const note = materialNote ? `, ${materialNote}` : "";
    return `${material.name} (${material.code})${note}`;
  }
  const codes = articles.flatMap((a) => (a.material ? [a.material.code] : []));
  return [...new Set(codes)].join(" / ");
}

export function SpecList({
  material,
  materialNote,
  articles,
}: {
  material: Material | null;
  materialNote: string | null;
  articles: ArticleView[];
}) {
  const materials = materialText(material, materialNote, articles);
  const count = articles.length;
  const specs: Spec[] = [
    ...(materials
      ? [{ key: "material", term: "Material", value: materials }]
      : []),
    ...summarizeAttributes(articles).map((s) => ({
      key: `attribute-${s.key}`,
      term: s.label,
      value: s.text,
    })),
    {
      key: "articles",
      term: "Artikel",
      value: count === 1 ? "1 Variante" : `${count} Varianten`,
    },
  ];
  return (
    <dl className="border-t border-ink text-sm">
      {specs.map((s) => (
        <div
          key={s.key}
          className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 border-b border-line py-2.5"
        >
          <dt className="pt-0.5 font-mono text-xs uppercase tracking-wider text-muted">
            {s.term}
          </dt>
          <dd className="break-words">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

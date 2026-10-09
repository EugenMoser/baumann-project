import { articleAnchorId } from "@/lib/catalog/anchors";
import type { ArticleView } from "@/lib/catalog/types";
import type { VariantMatrix } from "@/lib/catalog/variants";
import { SelectedOrderNumber } from "./color-selection";

const number = new Intl.NumberFormat("de-DE");

function formatValue(value: number | string, unit: string | null): string {
  const text = typeof value === "number" ? number.format(value) : value;
  return unit ? `${text} ${unit}` : text;
}

export function ArticleTable({
  productName,
  articles,
  matrix,
}: {
  productName: string;
  articles: ArticleView[];
  matrix: VariantMatrix;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Artikel von {productName}</caption>
        <thead className="bg-surface text-muted">
          <tr>
            {[
              "Artikel-Nr.",
              "Bezeichnung",
              "Merkmale",
              "Verpackungseinheit",
              "Bestell-Nr.",
            ].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => {
            const variants = matrix.byArticle[a.articleNumber] ?? {
              numbers: {},
              fallback: a.articleNumber,
            };
            return (
              <tr
                key={a.articleNumber}
                id={articleAnchorId(a.articleNumber)}
                className="scroll-mt-24 border-t border-line align-top target:bg-surface"
              >
                <th scope="row" className="px-3 py-2 font-mono font-medium">
                  {a.articleNumber}
                </th>
                <td className="px-3 py-2">{a.name ?? productName}</td>
                <td className="px-3 py-2">
                  <ul className="flex flex-col gap-0.5">
                    {a.attributes.map((attr) => (
                      <li key={attr.key}>
                        {attr.label}: {formatValue(attr.value, attr.unit)}
                      </li>
                    ))}
                    {a.material && (
                      <li>
                        Material: {a.material.code}
                        {a.materialNote ? `, ${a.materialNote}` : ""}
                      </li>
                    )}
                    {a.note && <li className="text-muted">{a.note}</li>}
                    {a.description && (
                      <li className="text-muted">{a.description}</li>
                    )}
                  </ul>
                </td>
                <td className="px-3 py-2">
                  {a.packaging.length > 0
                    ? a.packaging
                        .map(
                          (p) =>
                            `${number.format(p.quantity)} ${p.label ?? "Stück"}`
                        )
                        .join(" / ")
                    : "–"}
                </td>
                <td className="px-3 py-2">
                  <SelectedOrderNumber
                    numbers={variants.numbers}
                    fallback={variants.fallback}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

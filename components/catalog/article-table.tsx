import { articleAnchorId } from "@/lib/catalog/anchors";
import { attributeColumns } from "@/lib/catalog/attribute-summary";
import type { ArticleView, Material } from "@/lib/catalog/types";
import type { VariantMatrix } from "@/lib/catalog/variants";
import { SelectedOrderNumber } from "./color-selection";

const number = new Intl.NumberFormat("de-DE");

function formatValue(value: number | string, unit: string | null): string {
  const text = typeof value === "number" ? number.format(value) : value;
  return unit ? `${text} ${unit}` : text;
}

// Separate borders: collapsed borders vanish under the sticky first column.
const HEAD =
  "border-b border-ink px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-wider whitespace-nowrap";
const CELL = "border-b border-line px-3 py-2.5";
// D6: the article number column stays visible while the table scrolls; the
// :target highlight (exact search hit) also covers the sticky cell.
const STICKY = "sticky left-0";

export function ArticleTable({
  productName,
  articles,
  matrix,
  productMaterial,
}: {
  productName: string;
  articles: ArticleView[];
  matrix: VariantMatrix;
  productMaterial: Material | null;
}) {
  const columns = attributeColumns(articles);
  return (
    <div
      role="region"
      aria-label={`Artikel von ${productName}`}
      tabIndex={0}
      className="overflow-x-auto"
    >
      <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">Artikel von {productName}</caption>
        <thead className="bg-surface text-muted">
          <tr>
            <th scope="col" className={`${HEAD} ${STICKY} bg-surface`}>
              Art.-Nr.
            </th>
            <th scope="col" className={HEAD}>
              Bezeichnung
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${HEAD} ${c.numeric ? "text-right" : ""}`}
              >
                {c.label}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              Verpackungseinheit
            </th>
            <th scope="col" className={HEAD}>
              Bestell-Nr.
            </th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => {
            const variants = matrix.byArticle[a.articleNumber] ?? {
              numbers: {},
              fallback: a.articleNumber,
            };
            // D4: shown when it adds something to the product material.
            const ownMaterial =
              a.material?.code !== productMaterial?.code || a.materialNote
                ? a.material
                : null;
            return (
              <tr
                key={a.articleNumber}
                id={articleAnchorId(a.articleNumber)}
                className="group scroll-mt-24 align-top target:bg-accent-soft"
              >
                <th
                  scope="row"
                  className={`${CELL} ${STICKY} whitespace-nowrap bg-paper font-mono font-semibold group-target:bg-accent-soft group-target:shadow-[inset_3px_0_0] group-target:shadow-accent`}
                >
                  {a.articleNumber}
                </th>
                <td className={`${CELL} min-w-48`}>
                  <span className="block">{a.name ?? productName}</span>
                  {ownMaterial && (
                    <span className="block text-xs text-muted">
                      Material: {ownMaterial.code}
                      {a.materialNote ? `, ${a.materialNote}` : ""}
                    </span>
                  )}
                  {a.note && (
                    <span className="block text-xs text-muted">{a.note}</span>
                  )}
                  {a.description && (
                    <span className="block text-xs text-muted">
                      {a.description}
                    </span>
                  )}
                </td>
                {columns.map((c) => {
                  const attr = a.attributes.find((x) => x.key === c.key);
                  return (
                    <td
                      key={c.key}
                      className={`${CELL} whitespace-nowrap ${c.numeric ? "text-right tabular-nums" : ""}`}
                    >
                      {attr ? formatValue(attr.value, attr.unit) : "–"}
                    </td>
                  );
                })}
                <td className={CELL}>
                  {a.packaging.length > 0
                    ? a.packaging
                        .map(
                          (p) =>
                            `${number.format(p.quantity)} ${p.label ?? "Stück"}`
                        )
                        .join(" / ")
                    : "–"}
                </td>
                <td className={CELL}>
                  <span className="inline-block whitespace-nowrap bg-surface px-2 py-0.5">
                    <SelectedOrderNumber
                      numbers={variants.numbers}
                      fallback={variants.fallback}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

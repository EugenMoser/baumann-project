import type { ProductPage } from "@/lib/catalog/types";

// Every SKU of the JSON-LD as visible text (spec D6, data model).
export function OrderNumberList({
  page,
}: {
  page: Pick<ProductPage, "articles" | "variants" | "colors">;
}) {
  const colorName = new Map(page.colors.map((c) => [c.id, c.name]));
  return (
    <section aria-labelledby="bestellnummern" className="flex flex-col gap-3">
      <h2 id="bestellnummern" className="text-lg font-semibold">
        Alle Bestellnummern
      </h2>
      <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {page.variants.map((v) => (
          <li key={`${v.articleNumber}|${v.colorId ?? "none"}`}>
            <span className="font-mono">{v.orderNumber}</span>
            {v.colorId !== null && colorName.has(v.colorId) && (
              <span className="text-muted"> – {colorName.get(v.colorId)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { ProductSummary } from "@/lib/catalog/types";
import { ProductTile } from "./product-tile";

export function RelatedProducts({
  categorySlug,
  products,
}: {
  categorySlug: string;
  products: ProductSummary[];
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="verwandt" className="flex flex-col gap-4">
      <h2 id="verwandt" className="text-lg font-semibold">
        Weitere Produkte dieser Kategorie
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.slug}>
            <ProductTile categorySlug={categorySlug} product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import type { ProductPage } from "@/lib/catalog/types";
import { inquiryPath } from "@/lib/inquiry/path";

// Every SKU of the JSON-LD as visible text (spec D6, data model).
export function OrderNumberList({
  page,
}: {
  page: Pick<ProductPage, "articles" | "variants" | "colors">;
}) {
  const colorName = new Map(page.colors.map((c) => [c.id, c.name]));
  return (
    <section aria-labelledby="bestellnummern" className="flex flex-col gap-4">
      <h2 id="bestellnummern" className="text-xl font-semibold tracking-tight">
        Alle Bestellnummern
      </h2>
      <ul className="grid border-t border-line text-sm sm:grid-cols-2 sm:gap-x-8">
        {page.variants.map((v) => (
          <li
            key={`${v.articleNumber}|${v.colorId ?? "none"}`}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2"
          >
            <Link
              href={inquiryPath(v.orderNumber)}
              className="font-mono text-ink underline decoration-line underline-offset-4 hover:text-accent-strong hover:decoration-accent motion-safe:transition-colors motion-safe:duration-150"
            >
              {v.orderNumber}
              <span className="sr-only"> anfragen</span>
            </Link>
            {v.colorId !== null && colorName.has(v.colorId) && (
              <span className="text-muted">{colorName.get(v.colorId)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { articleAnchorId, productPath } from "@/lib/catalog/anchors";
import type { AccessoryView } from "@/lib/catalog/types";

export function AccessoryList({
  accessories,
}: {
  accessories: AccessoryView[];
}) {
  if (accessories.length === 0) return null;
  return (
    <section aria-labelledby="zubehoer" className="flex flex-col gap-4">
      <h2 id="zubehoer" className="text-xl font-semibold tracking-tight">
        Passendes Zubehör
      </h2>
      <ul className="border-t border-line text-sm">
        {accessories.map((a) => (
          <li key={a.articleNumber} className="border-b border-line">
            <Link
              href={`${productPath(a.categorySlug, a.productSlug)}#${articleAnchorId(a.articleNumber)}`}
              className="group flex items-baseline gap-4 py-2.5 hover:bg-surface sm:px-2"
            >
              <span className="shrink-0 font-mono font-semibold">
                {a.articleNumber}
              </span>
              <span className="min-w-0 flex-1 break-words group-hover:text-accent-strong">
                {a.name ?? a.productName}
              </span>
              <span aria-hidden="true" className="shrink-0 text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

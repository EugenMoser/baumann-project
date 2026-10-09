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
    <section aria-labelledby="zubehoer" className="flex flex-col gap-3">
      <h2 id="zubehoer" className="text-lg font-semibold">
        Passendes Zubehör
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {accessories.map((a) => (
          <li key={a.articleNumber}>
            <Link
              href={`${productPath(a.categorySlug, a.productSlug)}#${articleAnchorId(a.articleNumber)}`}
              className="text-accent underline underline-offset-2"
            >
              <span className="font-mono">{a.articleNumber}</span>{" "}
              {a.name ?? a.productName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

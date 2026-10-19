import Link from "next/link";
import { productPath } from "@/lib/catalog/anchors";
import type { SearchResult } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

const MAX_NUMBERS = 5;

export function SearchResults({ results }: { results: SearchResult[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line border border-line">
      {results.map((r) => (
        <li
          key={`${r.categorySlug}/${r.productSlug}`}
          className="flex items-start gap-4 p-4"
        >
          <ProductImage
            image={r.thumbnail}
            name={r.name}
            sizes="56px"
            variant="thumb"
          />
          <div className="flex min-w-0 flex-col">
            <Link
              href={productPath(r.categorySlug, r.productSlug)}
              className="font-medium text-ink underline-offset-2 hover:text-accent-strong hover:underline"
            >
              {r.name}
            </Link>
            {r.subtitle && <p className="text-sm text-muted">{r.subtitle}</p>}
            {r.matchedNumbers.length > 0 && (
              <p className="mt-1 font-mono text-sm">
                {r.matchedNumbers.slice(0, MAX_NUMBERS).join(", ")}
                {r.matchedNumbers.length > MAX_NUMBERS ? " …" : ""}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

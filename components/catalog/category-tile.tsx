import Link from "next/link";
import type { CategoryListItem } from "@/lib/catalog/types";

export function CategoryTile({ category }: { category: CategoryListItem }) {
  return (
    <Link
      href={`/produkte/${encodeURIComponent(category.slug)}`}
      className="group flex flex-col justify-between gap-6 rounded-lg border border-line bg-surface p-5 hover:border-accent"
    >
      <span className="text-lg font-semibold group-hover:text-accent">
        {category.name}
      </span>
      <span className="font-mono text-sm text-muted">
        {category.productCount}{" "}
        {category.productCount === 1 ? "Produkt" : "Produkte"}
      </span>
    </Link>
  );
}

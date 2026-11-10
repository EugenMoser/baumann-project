import Link from "next/link";
import { productPath } from "@/lib/catalog/anchors";
import type { ProductSummary } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

export function ProductTile({
  categorySlug,
  product,
}: {
  categorySlug: string;
  product: ProductSummary;
}) {
  return (
    <Link
      href={productPath(categorySlug, product.slug)}
      className="group flex flex-col gap-3 border border-line p-3 hover:border-ink"
    >
      <ProductImage
        image={product.tileImage}
        name={product.name}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        variant="tile"
      />
      {/* Both blocks reserve two lines, so every tile has the same height. */}
      <span className="flex flex-col">
        <span className="line-clamp-2 h-12 break-words font-medium leading-6 group-hover:text-accent-strong">
          {product.name}
        </span>
        <span className="line-clamp-2 h-10 break-words text-sm leading-5 text-muted">
          {product.subtitle}
        </span>
      </span>
    </Link>
  );
}

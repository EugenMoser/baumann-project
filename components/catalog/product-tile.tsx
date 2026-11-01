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
      <span className="flex flex-col">
        <span className="font-medium group-hover:text-accent-strong">
          {product.name}
        </span>
        {product.subtitle && (
          <span className="text-sm text-muted">{product.subtitle}</span>
        )}
      </span>
    </Link>
  );
}

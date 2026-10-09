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
      className="group flex flex-col gap-3 rounded-lg border border-line p-3 hover:border-accent"
    >
      <ProductImage
        image={product.thumbnail}
        name={product.name}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
      />
      <span className="flex flex-col">
        <span className="font-medium group-hover:text-accent">
          {product.name}
        </span>
        {product.subtitle && (
          <span className="text-sm text-muted">{product.subtitle}</span>
        )}
      </span>
    </Link>
  );
}

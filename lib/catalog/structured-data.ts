import type { ProductPage } from "./types";

// Data model, "Structured data": ProductGroup + one Product per variant,
// sku = order number. No offers — the business works by inquiry.
export function buildProductGroup(
  page: ProductPage,
  pageUrl: string,
  imageUrl: (storagePath: string) => string
): Record<string, unknown> & { hasVariant: Record<string, unknown>[] } {
  const colorName = new Map(page.colors.map((c) => [c.id, c.name]));
  const variesBy = [
    ...(page.colors.length > 1 ? ["https://schema.org/color"] : []),
    ...(page.articles.length > 1 ? ["https://schema.org/size"] : []),
  ];
  const images = page.media.map((m) => imageUrl(m.storagePath));
  const description = page.description ?? page.subtitle;

  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    productGroupID: page.slug,
    name: page.name,
    ...(description ? { description } : {}),
    url: pageUrl,
    ...(images.length > 0 ? { image: images } : {}),
    ...(variesBy.length > 0 ? { variesBy } : {}),
    hasVariant: page.variants.map((v) => {
      const color = v.colorId === null ? undefined : colorName.get(v.colorId);
      return {
        "@type": "Product",
        sku: v.orderNumber,
        name: `${page.name} ${v.orderNumber}`,
        ...(color ? { color } : {}),
      };
    }),
  };
}

// JSON inside <script> must not contain "<" (e.g. "</script>").
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

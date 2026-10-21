import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccessoryList } from "@/components/catalog/accessory-list";
import { AiLabel } from "@/components/catalog/ai-label";
import { ArticleTable } from "@/components/catalog/article-table";
import {
  ColorPicker,
  ColorSelectionProvider,
} from "@/components/catalog/color-selection";
import { Gallery } from "@/components/catalog/gallery";
import { JsonLd } from "@/components/catalog/json-ld";
import { OrderBox } from "@/components/catalog/order-box";
import { OrderNumberList } from "@/components/catalog/order-number-list";
import { Paragraphs } from "@/components/catalog/paragraphs";
import { RelatedProducts } from "@/components/catalog/related-products";
import { SpecList } from "@/components/catalog/spec-list";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { Eyebrow } from "@/components/site/eyebrow";
import { productPath } from "@/lib/catalog/anchors";
import { loadProductPage } from "@/lib/catalog/load";
import { publicMediaUrl } from "@/lib/catalog/media";
import { productMetadata } from "@/lib/catalog/metadata";
import { buildProductGroup } from "@/lib/catalog/structured-data";
import { buildVariantMatrix, orderBoxNumbers } from "@/lib/catalog/variants";
import { publicEnv } from "@/lib/env/public";

// D1: rendered on first request, cached, refreshed after at most one hour.
export const revalidate = 3600;

export function generateStaticParams(): {
  category: string;
  product: string;
}[] {
  return []; // nothing at build time (D2)
}

type Props = PageProps<"/produkte/[category]/[product]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, product } = await params;
  return productMetadata(await loadProductPage(category, product));
}

export default async function ProductPage({ params }: Props) {
  const { category, product } = await params;
  const page = await loadProductPage(category, product);
  // Table order throughout: the order box picks the first article per colour.
  const matrix = buildVariantMatrix(page);
  const box = orderBoxNumbers(matrix, page.articles);
  const url = new URL(
    productPath(page.category.slug, page.slug),
    publicEnv.NEXT_PUBLIC_SITE_URL
  ).toString();

  // D4: picker, order box and table share one colour selection.
  const withSelection = (children: ReactNode) =>
    matrix.defaultKey ? (
      <ColorSelectionProvider defaultKey={matrix.defaultKey}>
        {children}
      </ColorSelectionProvider>
    ) : (
      children
    );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <JsonLd data={buildProductGroup(page, url, (p) => publicMediaUrl(p))} />
      <Breadcrumb
        items={[
          { label: "Produkte", href: "/produkte" },
          {
            label: page.category.name,
            href: `/produkte/${encodeURIComponent(page.category.slug)}`,
          },
          { label: page.name },
        ]}
      />
      {withSelection(
        <>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="min-w-0">
              <Gallery media={page.media} name={page.name} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-3">
                <Eyebrow>
                  {page.category.name} · {page.articles.length} Artikel
                </Eyebrow>
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                  {page.name}
                </h1>
                {page.subtitle && (
                  <p className="text-lg text-muted">{page.subtitle}</p>
                )}
              </div>
              {page.description && (
                <div className="flex flex-col gap-2">
                  <AiLabel origin={page.descriptionOrigin} />
                  <Paragraphs text={page.description} />
                </div>
              )}
              <SpecList
                material={page.material}
                materialNote={page.materialNote}
                articles={page.articles}
              />
              <ColorPicker options={matrix.options} />
              <OrderBox box={box} />
            </div>
          </div>

          <section aria-labelledby="artikel" className="flex flex-col gap-4">
            <h2 id="artikel" className="text-xl font-semibold tracking-tight">
              Artikel
            </h2>
            <ArticleTable
              productName={page.name}
              articles={page.articles}
              matrix={matrix}
              productMaterial={page.material}
            />
          </section>
        </>
      )}

      <OrderNumberList page={page} />
      <AccessoryList accessories={page.accessories} />
      <RelatedProducts
        categorySlug={page.category.slug}
        products={page.related}
      />
    </main>
  );
}

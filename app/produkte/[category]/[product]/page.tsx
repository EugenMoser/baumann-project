import type { Metadata } from "next";
import { AccessoryList } from "@/components/catalog/accessory-list";
import { AiLabel } from "@/components/catalog/ai-label";
import { ArticleTable } from "@/components/catalog/article-table";
import {
  ColorPicker,
  ColorSelectionProvider,
} from "@/components/catalog/color-selection";
import { Gallery } from "@/components/catalog/gallery";
import { JsonLd } from "@/components/catalog/json-ld";
import { OrderNumberList } from "@/components/catalog/order-number-list";
import { Paragraphs } from "@/components/catalog/paragraphs";
import { RelatedProducts } from "@/components/catalog/related-products";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { branding } from "@/config/branding";
import { productPath } from "@/lib/catalog/anchors";
import { loadProductPage } from "@/lib/catalog/load";
import { publicMediaUrl } from "@/lib/catalog/media";
import { productMetadata } from "@/lib/catalog/metadata";
import { buildProductGroup } from "@/lib/catalog/structured-data";
import { buildVariantMatrix } from "@/lib/catalog/variants";
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
  const matrix = buildVariantMatrix(page);
  const url = new URL(
    productPath(page.category.slug, page.slug),
    publicEnv.NEXT_PUBLIC_SITE_URL
  ).toString();
  const table = (
    <ArticleTable
      productName={page.name}
      articles={page.articles}
      matrix={matrix}
    />
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
      <div className="grid gap-8 lg:grid-cols-2">
        <Gallery media={page.media} name={page.name} />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
          {page.subtitle && (
            <p className="text-lg text-muted">{page.subtitle}</p>
          )}
          {page.description && (
            <div className="flex flex-col gap-2">
              <AiLabel origin={page.descriptionOrigin} />
              <Paragraphs text={page.description} />
            </div>
          )}
          {page.material && (
            <p className="text-sm">
              <span className="text-muted">Material: </span>
              {page.material.name} ({page.material.code})
              {page.materialNote ? `, ${page.materialNote}` : ""}
            </p>
          )}
          <a
            href={branding.officialSiteUrl}
            className="w-fit text-sm text-accent underline underline-offset-2"
          >
            Anfrage über die offizielle Website
          </a>
        </div>
      </div>

      <section aria-labelledby="artikel" className="flex flex-col gap-4">
        <h2 id="artikel" className="text-lg font-semibold">
          Artikel
        </h2>
        {matrix.defaultKey ? (
          <ColorSelectionProvider defaultKey={matrix.defaultKey}>
            <ColorPicker options={matrix.options} />
            {table}
          </ColorSelectionProvider>
        ) : (
          table
        )}
      </section>

      <OrderNumberList page={page} />
      <AccessoryList accessories={page.accessories} />
      <RelatedProducts
        categorySlug={page.category.slug}
        products={page.related}
      />
    </main>
  );
}

import type { Metadata } from "next";
import { Paragraphs } from "@/components/catalog/paragraphs";
import { ProductTile } from "@/components/catalog/product-tile";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { loadCategoryPage } from "@/lib/catalog/load";
import { categoryMetadata } from "@/lib/catalog/metadata";

// D1: rendered on first request, cached, refreshed after at most one hour.
export const revalidate = 3600;

export function generateStaticParams(): { category: string }[] {
  return []; // nothing at build time (D2)
}

export async function generateMetadata({
  params,
}: PageProps<"/produkte/[category]">): Promise<Metadata> {
  const { category } = await params;
  return categoryMetadata(await loadCategoryPage(category));
}

export default async function CategoryPage({
  params,
}: PageProps<"/produkte/[category]">) {
  const { category } = await params;
  const page = await loadCategoryPage(category);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <Breadcrumb
        items={[{ label: "Produkte", href: "/produkte" }, { label: page.name }]}
      />
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
        <Paragraphs
          text={page.introText}
          className="flex max-w-prose flex-col gap-3 leading-relaxed text-muted"
        />
      </header>
      {page.products.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.products.map((p) => (
            <li key={p.slug}>
              <ProductTile categorySlug={page.slug} product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">
          In dieser Kategorie sind noch keine Produkte veröffentlicht.
        </p>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { CategoryTile } from "@/components/catalog/category-tile";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { loadCategories } from "@/lib/catalog/load";

export const metadata: Metadata = {
  title: "Produkte",
  description: "Alle Produktkategorien im Überblick.",
};

export default async function ProductsPage() {
  await connection(); // per request (D2)
  const categories = await loadCategories();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <Breadcrumb items={[{ label: "Produkte" }]} />
      <h1 className="text-3xl font-semibold tracking-tight">Produkte</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li key={c.slug}>
            <CategoryTile category={c} />
          </li>
        ))}
      </ul>
    </main>
  );
}

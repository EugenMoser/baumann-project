import { connection } from "next/server";
import { CategoryTile } from "@/components/catalog/category-tile";
import { SearchForm } from "@/components/site/search-form";
import { branding } from "@/config/branding";
import { loadCategories } from "@/lib/catalog/load";

export default async function HomePage() {
  await connection(); // per request: no database access during the build (D2)
  const categories = await loadCategories();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12">
      <section className="flex flex-col gap-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Produktkatalog
        </p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Kunststoff-Spritzgussteile von {branding.companyName}
        </h1>
        <p className="max-w-prose text-muted">
          Alle Produkte mit Artikelnummern, Maßen, Farben und Bestellnummern.
          Suchen Sie nach Produktname oder direkt nach einer Artikel- oder
          Bestellnummer.
        </p>
        <SearchForm size="large" id="suche-start" />
      </section>
      <section aria-labelledby="kategorien" className="flex flex-col gap-4">
        <h2 id="kategorien" className="text-xl font-semibold">
          Kategorien
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <CategoryTile category={c} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

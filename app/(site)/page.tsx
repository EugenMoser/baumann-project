import Link from "next/link";
import { connection } from "next/server";
import { CategoryRegister } from "@/components/catalog/category-register";
import { FactsBar } from "@/components/catalog/facts-bar";
import { Eyebrow } from "@/components/site/eyebrow";
import { SearchForm } from "@/components/site/search-form";
import { branding } from "@/config/branding";
import { loadOverview } from "@/lib/catalog/load";

const groups = (n: number) =>
  `${n} ${n === 1 ? "Produktgruppe" : "Produktgruppen"}`;

export default async function HomePage() {
  await connection(); // per request: no database access during the build (D2)
  const overview = await loadOverview();
  const { example } = overview;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12">
      <section aria-labelledby="start-titel" className="flex flex-col gap-5">
        <Eyebrow>
          Produktkatalog · {groups(overview.productCount)} ·{" "}
          {overview.articleCount} Artikel
        </Eyebrow>
        <h1
          id="start-titel"
          className="max-w-3xl break-words text-[clamp(1.875rem,6vw,3rem)] font-semibold leading-tight tracking-tight"
        >
          {branding.home.title}
        </h1>
        <p className="max-w-prose text-muted">{branding.home.lead}</p>
        <SearchForm
          size="large"
          id="suche-start"
          ariaLabel="Suche nach Produkten"
        />
        {example ? (
          <p className="break-words font-mono text-sm text-muted">
            Direkt zur Nummer:{" "}
            <Link
              href={`/suche?q=${encodeURIComponent(example.articleNumber)}`}
              className="text-ink underline underline-offset-2 hover:text-accent-strong"
            >
              {example.articleNumber}
            </Link>{" "}
            → {example.productName}
          </p>
        ) : null}
      </section>
      <FactsBar facts={branding.home.facts} />
      <section aria-labelledby="kategorien" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="kategorien" className="text-xl font-semibold">
            Kategorien
          </h2>
          <Link
            href="/produkte"
            className="text-sm underline underline-offset-2 hover:text-accent-strong"
          >
            Alle Produkte →
          </Link>
        </div>
        <CategoryRegister items={overview.categories} />
      </section>
    </main>
  );
}

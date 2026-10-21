import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SearchResults } from "@/components/catalog/search-results";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { PageHeader } from "@/components/site/page-header";
import { SearchForm } from "@/components/site/search-form";
import { exactHitTarget } from "@/lib/catalog/anchors";
import { unwrap } from "@/lib/catalog/load";
import { searchCatalog, withThumbnails } from "@/lib/catalog/search";
import {
  parseSearchQuery,
  SEARCH_MAX,
  SEARCH_MIN,
} from "@/lib/catalog/search-query";

export const metadata: Metadata = {
  title: "Suche",
  description: "Suche nach Produkten, Artikel- und Bestellnummern.",
};

const HINTS = {
  empty:
    "Geben Sie einen Produktnamen, eine Artikel- oder eine Bestellnummer ein.",
  too_short: `Bitte mindestens ${SEARCH_MIN} Zeichen eingeben.`,
  too_long: `Bitte höchstens ${SEARCH_MAX} Zeichen eingeben.`,
} as const;

// searchParams makes this page render per request (D2, D3).
export default async function SearchPage({
  searchParams,
}: PageProps<"/suche">) {
  const { q } = await searchParams;
  const query = parseSearchQuery(q);
  const raw = typeof q === "string" ? q : Array.isArray(q) ? (q[0] ?? "") : "";

  if (!query.ok) {
    return (
      <SearchShell defaultValue={raw}>
        <p className="text-muted">{HINTS[query.reason]}</p>
      </SearchShell>
    );
  }

  const hits = unwrap(await searchCatalog(query.value), "search");
  const target = exactHitTarget(hits);
  if (target) redirect(target); // D4: exact number hit → straight to the article
  const results = unwrap(await withThumbnails(hits), "search thumbnails");

  return (
    <SearchShell defaultValue={query.value}>
      <p aria-live="polite" className="text-sm text-muted">
        {hits.length === 0
          ? `Keine Treffer für „${query.value}“.`
          : `${hits.length} Treffer für „${query.value}“`}
      </p>
      {results.length > 0 && <SearchResults results={results} />}
    </SearchShell>
  );
}

function SearchShell({
  defaultValue,
  children,
}: {
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <Breadcrumb items={[{ label: "Suche" }]} />
      <PageHeader eyebrow="Katalogsuche" title="Suche" />
      <SearchForm
        size="large"
        defaultValue={defaultValue}
        id="suche-seite"
        ariaLabel="Suche verfeinern"
      />
      {children}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { SearchForm } from "@/components/site/search-form";
import { exactHitTarget, productPath } from "@/lib/catalog/anchors";
import { unwrap } from "@/lib/catalog/load";
import { searchCatalog } from "@/lib/catalog/search";
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

  return (
    <SearchShell defaultValue={query.value}>
      <p aria-live="polite" className="text-sm text-muted">
        {hits.length === 0
          ? `Keine Treffer für „${query.value}“.`
          : `${hits.length} Treffer für „${query.value}“`}
      </p>
      {hits.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {hits.map((h) => (
            <li key={`${h.categorySlug}/${h.productSlug}`} className="p-4">
              <Link
                href={productPath(h.categorySlug, h.productSlug)}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                {h.name}
              </Link>
              {h.subtitle && <p className="text-sm text-muted">{h.subtitle}</p>}
              {h.matchedNumbers.length > 0 && (
                <p className="mt-1 font-mono text-sm">
                  {h.matchedNumbers.slice(0, 5).join(", ")}
                  {h.matchedNumbers.length > 5 ? " …" : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
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
      <h1 className="text-3xl font-semibold tracking-tight">Suche</h1>
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

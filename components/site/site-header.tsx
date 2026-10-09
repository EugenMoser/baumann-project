import Link from "next/link";
import type { Branding } from "@/config/branding";
import { SearchForm } from "./search-form";

// Reads only branding, never the database (spec D12).
export function SiteHeader({ branding }: { branding: Branding }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {branding.shortName}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            Produktkatalog
          </span>
        </Link>
        <nav aria-label="Hauptnavigation">
          <Link
            href="/produkte"
            className="text-sm font-medium hover:text-accent"
          >
            Produkte
          </Link>
        </nav>
        <div className="w-full sm:ml-auto sm:w-auto">
          <SearchForm id="suche-header" ariaLabel="Katalogsuche" />
        </div>
      </div>
    </header>
  );
}

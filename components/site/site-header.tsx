import Link from "next/link";
import type { Branding } from "@/config/branding";
import { NavLink } from "./nav-link";
import { SearchForm } from "./search-form";

// Reads only branding, never the database (spec D12).
export function SiteHeader({ branding }: { branding: Branding }) {
  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="flex min-w-0 items-baseline gap-3">
          <span className="text-lg font-bold tracking-tight">
            {branding.shortName}
          </span>
          <span className="hidden truncate font-mono text-xs uppercase tracking-widest text-muted sm:inline">
            {branding.descriptor}
          </span>
        </Link>
        <nav aria-label="Hauptnavigation" className="flex gap-x-5 sm:gap-x-6">
          <NavLink href="/produkte">Produkte</NavLink>
          <NavLink href="/qualitaet">Qualität</NavLink>
          <NavLink href="/anfrage">Anfrage</NavLink>
        </nav>
        <div className="w-full lg:ml-auto lg:w-auto">
          <SearchForm id="suche-header" ariaLabel="Katalogsuche" />
        </div>
      </div>
    </header>
  );
}

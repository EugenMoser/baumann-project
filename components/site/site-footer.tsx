import Link from "next/link";
import type { Branding } from "@/config/branding";

export function SiteFooter({ branding }: { branding: Branding }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface text-sm text-muted">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:justify-between">
        <p>
          Vorschau, nicht indexiert.{" "}
          <a
            href={branding.officialSiteUrl}
            className="underline underline-offset-2 hover:text-accent"
          >
            Die offizielle Website von {branding.companyName}
          </a>
        </p>
        <nav
          aria-label="Rechtliches und Service"
          className="flex flex-wrap gap-x-4"
        >
          <Link
            href="/qualitaet"
            className="underline underline-offset-2 hover:text-accent"
          >
            Qualität
          </Link>
          <a
            href={branding.developer.imprintUrl}
            className="underline underline-offset-2 hover:text-accent"
          >
            Impressum
          </a>
          <a
            href={branding.developer.privacyUrl}
            className="underline underline-offset-2 hover:text-accent"
          >
            Datenschutz
          </a>
        </nav>
        <p>
          Umsetzung:{" "}
          <a
            href={branding.developer.url}
            className="underline underline-offset-2 hover:text-accent"
          >
            {branding.developer.name}
          </a>
        </p>
      </div>
    </footer>
  );
}

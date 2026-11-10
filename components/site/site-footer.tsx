import Link from "next/link";
import type { Branding } from "@/config/branding";
import { PRIVACY_PATH } from "@/lib/legal";

export function SiteFooter({ branding }: { branding: Branding }) {
  return (
    <footer className="mt-16 border-t border-ink bg-surface font-mono text-xs text-muted">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:justify-between">
        <p>
          Vorschau, nicht indexiert.{" "}
          <a
            href={branding.officialSiteUrl}
            className="underline underline-offset-2 hover:text-accent-strong"
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
            className="underline underline-offset-2 hover:text-accent-strong"
          >
            Qualität
          </Link>
          <a
            href={branding.developer.imprintUrl}
            className="underline underline-offset-2 hover:text-accent-strong"
          >
            Impressum
          </a>
          <Link
            href={PRIVACY_PATH}
            className="underline underline-offset-2 hover:text-accent-strong"
          >
            Datenschutz
          </Link>
        </nav>
        <p>
          Umsetzung:{" "}
          <a
            href={branding.developer.url}
            className="underline underline-offset-2 hover:text-accent-strong"
          >
            {branding.developer.name}
          </a>
        </p>
      </div>
    </footer>
  );
}

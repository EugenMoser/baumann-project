import Link from "next/link";
import { PageHeader } from "./page-header";

export function NotFoundContent() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-16">
      <PageHeader
        eyebrow="Fehler 404"
        title="Seite nicht gefunden"
        lead="Die angeforderte Seite existiert nicht."
      />
      <Link
        href="/"
        className="w-fit text-ink underline decoration-accent underline-offset-4 hover:text-accent-strong motion-safe:transition-colors motion-safe:duration-150"
      >
        Zur Startseite
      </Link>
    </main>
  );
}

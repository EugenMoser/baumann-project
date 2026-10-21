"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/site/page-header";

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

// Lives under app/ (not global-error) so it renders inside the root layout
// and keeps the demo bar.
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-16">
      <PageHeader eyebrow="Fehler" title="Etwas ist schiefgelaufen" />
      <button
        type="button"
        onClick={() => retry()}
        className="w-fit text-ink underline decoration-accent underline-offset-4 hover:text-accent-strong motion-safe:transition-colors motion-safe:duration-150"
      >
        Erneut versuchen
      </button>
    </main>
  );
}

"use client";

import { useEffect } from "react";

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Etwas ist schiefgelaufen</h1>
      <button
        type="button"
        onClick={() => retry()}
        className="w-fit text-accent underline underline-offset-2"
      >
        Erneut versuchen
      </button>
    </main>
  );
}

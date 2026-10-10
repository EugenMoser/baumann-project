import Link from "next/link";

export function NotFoundContent() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <Link href="/" className="text-accent underline underline-offset-2">
        Zur Startseite
      </Link>
    </main>
  );
}

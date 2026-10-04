import { branding } from "@/config/branding";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">{branding.companyName}</h1>
      <p>
        Der Produktkatalog wird gerade aufgebaut. Diese Vorschau wächst
        schrittweise.
      </p>
    </main>
  );
}

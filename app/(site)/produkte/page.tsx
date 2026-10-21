import type { Metadata } from "next";
import { connection } from "next/server";
import { CategoryRegister } from "@/components/catalog/category-register";
import { PageHeader } from "@/components/site/page-header";
import { loadOverview } from "@/lib/catalog/load";

const lead = "Alle Produktkategorien im Überblick.";

export const metadata: Metadata = {
  title: "Produkte",
  description: lead,
};

export default async function ProductsPage() {
  await connection(); // per request (D2)
  const overview = await loadOverview();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <PageHeader eyebrow="Produktkatalog" title="Produkte" lead={lead} />
      <CategoryRegister items={overview.categories} />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ProductList } from "@/components/admin/product-list";
import { Button } from "@/components/ui/button";
import { parseFilter } from "@/lib/admin/filter";
import { listProducts, loadEditorOptions } from "@/lib/admin/products";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Produkte" };

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/produkte">) {
  const filter = parseFilter(await searchParams);
  const client = await createSessionSupabase();
  const [list, options] = await Promise.all([
    listProducts(client, filter),
    loadEditorOptions(client),
  ]);
  const items = unwrapAdmin(list, "product list");
  const { categories } = unwrapAdmin(options, "editor options");
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Produkte</h1>
        <Button asChild>
          <Link href="/admin/produkte/neu">Neues Produkt</Link>
        </Button>
      </div>
      <ProductList items={items} filter={filter} categories={categories} />
    </>
  );
}

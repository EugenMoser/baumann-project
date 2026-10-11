import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CategoryForm } from "@/components/admin/category-form";
import { DeleteRecordButton } from "@/components/admin/delete-record-button";
import { getCategory } from "@/lib/admin/categories";
import { loadEditorOptions } from "@/lib/admin/products";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

const ID_PATTERN = /^[1-9]\d{0,9}$/;

// Shared by generateMetadata and the page so the category loads once per request.
const loadCategory = cache(async (id: number) => {
  const client = await createSessionSupabase();
  const [category, options] = await Promise.all([
    getCategory(client, id),
    loadEditorOptions(client),
  ]);
  return {
    category: unwrapAdmin(category, "category"),
    options: unwrapAdmin(options, "editor options"),
  };
});

export async function generateMetadata({
  params,
}: PageProps<"/admin/kategorien/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { category } = await loadCategory(Number(id));
  return { title: category.values.name };
}

export default async function EditCategoryPage({
  params,
}: PageProps<"/admin/kategorien/[id]">) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { category, options } = await loadCategory(Number(id));
  return (
    <>
      <Link
        href="/admin/kategorien"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Alle Kategorien
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{category.values.name}</h1>
      <CategoryForm
        action={saveCategoryAction}
        initial={category.values}
        attributes={options.attributes}
        categoryId={category.id}
      />
      <div className="mt-8">
        {category.productCount === 0 ? (
          <DeleteRecordButton
            action={deleteCategoryAction}
            id={category.id}
            title="Kategorie löschen?"
            description="Die Kategorie wird endgültig gelöscht."
            buttonLabel="Kategorie löschen"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Löschen ist nur ohne Produkte möglich ({category.productCount}{" "}
            {category.productCount === 1 ? "Produkt" : "Produkte"}).
          </p>
        )}
      </div>
    </>
  );
}

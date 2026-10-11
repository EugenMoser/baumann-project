import type { Metadata } from "next";
import { CategoryForm } from "@/components/admin/category-form";
import { emptyCategoryValues } from "@/lib/admin/category-schema";
import { loadEditorOptions } from "@/lib/admin/products";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";
import { saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Neue Kategorie" };

export default async function NewCategoryPage() {
  const client = await createSessionSupabase();
  const options = unwrapAdmin(
    await loadEditorOptions(client),
    "editor options"
  );
  return (
    <>
      <h1 className="text-2xl font-semibold">Neue Kategorie</h1>
      <CategoryForm
        action={saveCategoryAction}
        initial={emptyCategoryValues()}
        attributes={options.attributes}
        categoryId={null}
      />
    </>
  );
}

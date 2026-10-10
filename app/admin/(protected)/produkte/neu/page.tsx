import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { loadEditorOptions } from "@/lib/admin/products";
import { emptyProductValues } from "@/lib/admin/schemas";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";
import { deleteProductAction, saveProductAction } from "../actions";

export const metadata: Metadata = { title: "Neues Produkt" };

export default async function NewProductPage() {
  const client = await createSessionSupabase();
  const options = unwrapAdmin(
    await loadEditorOptions(client),
    "editor options"
  );
  return (
    <>
      <h1 className="text-2xl font-semibold">Neues Produkt</h1>
      <ProductForm
        action={saveProductAction}
        deleteAction={deleteProductAction}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
      />
    </>
  );
}

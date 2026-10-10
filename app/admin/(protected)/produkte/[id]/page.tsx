import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductForm } from "@/components/admin/product-form";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  getProductEditor,
  loadEditorOptions,
  toProductValues,
} from "@/lib/admin/products";
import { unwrapAdmin } from "@/lib/admin/server";
import { productPath } from "@/lib/catalog/anchors";
import { createSessionSupabase } from "@/lib/supabase/session";
import { deleteProductAction, saveProductAction } from "../actions";

const ID_PATTERN = /^[1-9]\d{0,9}$/;

// Shared by generateMetadata and the page so the editor loads once per request.
const loadEditor = cache(async (id: number) => {
  const client = await createSessionSupabase();
  const [editor, options] = await Promise.all([
    getProductEditor(client, id),
    loadEditorOptions(client),
  ]);
  return {
    editor: unwrapAdmin(editor, "product editor"),
    options: unwrapAdmin(options, "editor options"),
  };
});

export async function generateMetadata({
  params,
}: PageProps<"/admin/produkte/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { editor } = await loadEditor(Number(id));
  return { title: editor.product.name };
}

export default async function EditProductPage({
  params,
}: PageProps<"/admin/produkte/[id]">) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { editor, options } = await loadEditor(Number(id));
  const { product } = editor;
  return (
    <>
      <Link
        href="/admin/produkte"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Alle Produkte
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <StatusBadge status={product.status} />
        {product.status === "published" ? (
          <Link
            href={productPath(product.categorySlug, product.slug)}
            className="text-sm underline-offset-4 hover:underline"
          >
            Öffentliche Seite ansehen
          </Link>
        ) : null}
      </div>
      <ProductForm
        action={saveProductAction}
        deleteAction={deleteProductAction}
        initial={toProductValues(product)}
        options={options}
        productId={product.id}
        savedStatus={product.status}
      />
    </>
  );
}

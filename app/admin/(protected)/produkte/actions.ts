"use server";

import { redirect } from "next/navigation";
import {
  parseArticle,
  readArticleForm,
  type ArticleValues,
} from "@/lib/admin/article-schema";
import {
  deleteArticle,
  loadAttributeTypes,
  saveArticle,
} from "@/lib/admin/articles";
import { LOGIN_PATH } from "@/lib/admin/auth";
import {
  parseColors,
  readColorsForm,
  type ColorValues,
} from "@/lib/admin/color-schema";
import { setProductColors } from "@/lib/admin/colors";
import type { AdminError } from "@/lib/admin/errors";
import {
  errorState,
  readFields,
  zodFieldErrors,
  type FormState,
} from "@/lib/admin/form";
import { deleteProduct, saveProduct } from "@/lib/admin/products";
import {
  PRODUCT_FIELDS,
  productSchema,
  withDefaultSlug,
  type ProductValues,
} from "@/lib/admin/schemas";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";

const idFrom = (formData: FormData, name = "id"): number | null => {
  const raw = formData.get(name);
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
};

async function runWrite<T, V>(
  values: V,
  context: string,
  write: (client: AdminClient) => Promise<Result<T, AdminError>>
): Promise<{ state: FormState<V> } | { value: T }> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    write(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH); // Review Focus 3
  if (!outcome.result.ok)
    return { state: errorState(values, outcome.result.error) };
  return { value: outcome.result.value };
}

export async function saveProductAction(
  _prev: FormState<ProductValues>,
  formData: FormData
): Promise<FormState<ProductValues>> {
  const values = withDefaultSlug(readFields(formData, PRODUCT_FIELDS));
  const parsed = productSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const rawId = formData.get("id");
  const id = idFrom(formData);
  // Empty id means create; a non-empty malformed id must not fall through to it.
  if (id === null && rawId !== null && rawId !== "")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(values, "[admin] save product", (client) =>
    saveProduct(client, id, parsed.data)
  );
  if ("state" in done) return done.state;
  if (id === null) redirect(`/admin/produkte/${done.value.id}`);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteProductAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const id = idFrom(formData);
  if (id === null)
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(null, "[admin] delete product", (client) =>
    deleteProduct(client, id)
  );
  if ("state" in done) return done.state;
  redirect("/admin/produkte");
}

export async function saveArticleAction(
  _prev: FormState<ArticleValues>,
  formData: FormData
): Promise<FormState<ArticleValues>> {
  const values = readArticleForm(formData);
  const client = await createSessionSupabase();
  const types = await loadAttributeTypes(client);
  if (!types.ok) return errorState(values, types.error);
  const parsed = parseArticle(values, types.value);
  if (!parsed.ok) {
    // Errors on fields without a rendered input signal a tampered request.
    const tampered = Object.keys(parsed.fieldErrors).some(
      (k) =>
        k === "id" ||
        k === "productId" ||
        k === "form" ||
        (k.startsWith("attr:") &&
          parsed.fieldErrors[k] === "Unbekanntes Attribut.")
    );
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: tampered ? "Ungültige Anfrage." : null,
    };
  }
  const done = await runWrite(values, "[admin] save article", (c) =>
    saveArticle(c, parsed.value)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteArticleAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const productId = idFrom(formData, "productId");
  const articleId = idFrom(formData, "articleId");
  if (productId === null || articleId === null)
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(null, "[admin] delete article", (c) =>
    deleteArticle(c, productId, articleId)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}

export async function saveColorsAction(
  _prev: FormState<ColorValues>,
  formData: FormData
): Promise<FormState<ColorValues>> {
  const values = readColorsForm(formData);
  const parsed = parseColors(values);
  if (!parsed.ok)
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  const { productId, rows } = parsed.value;
  const done = await runWrite(values, "[admin] save colours", (c) =>
    setProductColors(c, productId, rows)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

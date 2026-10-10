"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
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
  const id = idFrom(formData);
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

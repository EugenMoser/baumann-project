"use server";

import { redirect } from "next/navigation";
import { deleteCategory, saveCategory } from "@/lib/admin/categories";
import {
  CATEGORY_CONFLICTS,
  categorySchema,
  readCategoryForm,
  withDefaultCategorySlug,
  type CategoryValues,
} from "@/lib/admin/category-schema";
import { zodFieldErrors, type FormState } from "@/lib/admin/form";
import { editIdFrom, idFrom, runWrite } from "@/lib/admin/server";

export async function saveCategoryAction(
  _prev: FormState<CategoryValues>,
  formData: FormData
): Promise<FormState<CategoryValues>> {
  const values = withDefaultCategorySlug(readCategoryForm(formData));
  const parsed = categorySchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const id = editIdFrom(formData);
  if (id === "invalid")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(
    values,
    "[admin] save category",
    (client) => saveCategory(client, id, parsed.data),
    CATEGORY_CONFLICTS
  );
  if ("state" in done) return done.state;
  if (id === null) redirect(`/admin/kategorien/${done.value.id}`);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteCategoryAction(
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
  const done = await runWrite(null, "[admin] delete category", (client) =>
    deleteCategory(client, id)
  );
  if ("state" in done) return done.state;
  redirect("/admin/kategorien");
}

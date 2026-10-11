"use server";

import { readFields, zodFieldErrors, type FormState } from "@/lib/admin/form";
import { deleteColor, saveColor } from "@/lib/admin/master-data";
import {
  COLOR_CONFLICTS,
  COLOR_FIELDS,
  colorSchema,
  type ColorMasterValues,
} from "@/lib/admin/master-schema";
import { editIdFrom, idFrom, runWrite } from "@/lib/admin/server";

const INVALID_REQUEST = "Ungültige Anfrage.";

export async function saveColorAction(
  _prev: FormState<ColorMasterValues>,
  formData: FormData
): Promise<FormState<ColorMasterValues>> {
  const values = readFields(formData, COLOR_FIELDS);
  const id = editIdFrom(formData);
  if (id === "invalid")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: INVALID_REQUEST,
    };
  const parsed = colorSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const done = await runWrite(
    values,
    "[admin] save colour",
    (client) => saveColor(client, id, parsed.data),
    COLOR_CONFLICTS
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteColorAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const id = idFrom(formData);
  if (id === null)
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: INVALID_REQUEST,
    };
  const done = await runWrite(null, "[admin] delete colour", (client) =>
    deleteColor(client, id)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}

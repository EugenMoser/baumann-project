"use server";

import { readFields, zodFieldErrors, type FormState } from "@/lib/admin/form";
import { deleteMaterial, saveMaterial } from "@/lib/admin/master-data";
import {
  MATERIAL_FIELDS,
  materialSchema,
  type MaterialValues,
  MATERIAL_CONFLICTS,
} from "@/lib/admin/master-schema";
import { editIdFrom, idFrom, runWrite } from "@/lib/admin/server";

const INVALID_REQUEST = "Ungültige Anfrage.";

export async function saveMaterialAction(
  _prev: FormState<MaterialValues>,
  formData: FormData
): Promise<FormState<MaterialValues>> {
  const values = readFields(formData, MATERIAL_FIELDS);
  const id = editIdFrom(formData);
  if (id === "invalid")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: INVALID_REQUEST,
    };
  const parsed = materialSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const done = await runWrite(
    values,
    "[admin] save material",
    (client) => saveMaterial(client, id, parsed.data),
    MATERIAL_CONFLICTS
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteMaterialAction(
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
  const done = await runWrite(null, "[admin] delete material", (client) =>
    deleteMaterial(client, id)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}

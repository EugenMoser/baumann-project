"use server";

import { resolveArticleNumbers, setAccessories } from "@/lib/admin/accessories";
import {
  parseAccessories,
  readAccessoryForm,
  unknownNumberErrors,
  type AccessoryValues,
} from "@/lib/admin/accessory-schema";
import { errorState, type FormState } from "@/lib/admin/form";
import { runWrite } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";

export async function saveAccessoriesAction(
  _prev: FormState<AccessoryValues>,
  formData: FormData
): Promise<FormState<AccessoryValues>> {
  const values = readAccessoryForm(formData);
  const parsed = parseAccessories(values);
  if (!parsed.ok) {
    if (parsed.fieldErrors.form)
      return {
        status: "error",
        values,
        fieldErrors: {},
        formError: "Ungültige Anfrage.",
      };
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  }
  const { productId, numbers, rows } = parsed.value;
  // Read-only lookup first; only the save goes through runWrite, so an
  // unknown number neither writes nor revalidates.
  const client = await createSessionSupabase();
  const resolved = await resolveArticleNumbers(client, numbers);
  if (!resolved.ok) return errorState(values, resolved.error);
  const unknown = unknownNumberErrors(numbers, resolved.value, rows);
  if (Object.keys(unknown).length > 0)
    return { status: "error", values, fieldErrors: unknown, formError: null };
  const ids = numbers.flatMap((n) => {
    const id = resolved.value.get(n);
    return id === undefined ? [] : [id];
  });
  const done = await runWrite(values, "[admin] save accessories", (c) =>
    setAccessories(c, productId, ids)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

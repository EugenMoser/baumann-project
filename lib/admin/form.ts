import type { z } from "zod";
import { CONFLICT_MESSAGES, formErrorFor, type AdminError } from "./errors";

export type FieldErrors = Record<string, string>;

export type FormState<V> = {
  status: "idle" | "saved" | "error";
  values: V;
  fieldErrors: FieldErrors;
  formError: string | null;
};

export function readFields<K extends string>(
  formData: FormData,
  fields: readonly K[]
): Record<K, string> {
  const values = {} as Record<K, string>;
  for (const field of fields) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

// First message per field; nested paths are joined with dots (rows.0.suffix).
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export const idleState = <V>(values: V): FormState<V> => ({
  status: "idle",
  values,
  fieldErrors: {},
  formError: null,
});

export function errorState<V>(values: V, error: AdminError): FormState<V> {
  if (error.kind === "conflict")
    return {
      status: "error",
      values,
      fieldErrors: {
        [error.field]: CONFLICT_MESSAGES[error.field] ?? "Wert schon vergeben.",
      },
      formError: null,
    };
  return {
    status: "error",
    values,
    fieldErrors: {},
    formError: formErrorFor(error),
  };
}

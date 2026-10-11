import "server-only";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";
import { checkAdmin, LOGIN_PATH } from "./auth";
import type { AdminError } from "./errors";
import { errorState, type FormState } from "./form";
import type { FileLog } from "./media-flow";
import { adminWrite, type WriteDeps } from "./write";

export const CATALOG_BUCKET = "catalog";
export const fileLog: FileLog = (context, detail) =>
  console.error(context, detail);

/** Positive integer form field, or null when absent or malformed. */
export const idFrom = (formData: FormData, name = "id"): number | null => {
  const raw = formData.get(name);
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
};

// D11: the catalog is small; revalidating every page is cheaper than tracking
// which category, related-product and search pages a change touches.
export function writeDeps(client: AdminClient): WriteDeps {
  return {
    check: () => checkAdmin(client),
    revalidate: () => revalidatePath("/", "layout"),
    logError: (context, code) => console.error(context, code ?? "unknown"),
  };
}

// Runs one admin write for a Server Action; an anonymous caller is sent to
// the login (Review Focus 3). `messages` overrides the conflict texts.
export async function runWrite<T, V>(
  values: V,
  context: string,
  write: (client: AdminClient) => Promise<Result<T, AdminError>>,
  messages?: Record<string, string>
): Promise<{ state: FormState<V> } | { value: T }> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    write(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok)
    return { state: errorState(values, outcome.result.error, messages) };
  return { value: outcome.result.value };
}

export function unwrapAdmin<T>(
  result: Result<T, AdminError>,
  context: string
): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") notFound();
  console.error(
    `[admin] ${context} failed:`,
    result.error.kind,
    result.error.kind === "db_error" ? result.error.code : ""
  );
  throw new Error("Admin-Daten konnten nicht geladen werden.");
}

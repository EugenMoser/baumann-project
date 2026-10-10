import "server-only";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import type { Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { checkAdmin } from "./auth";
import type { AdminError } from "./errors";
import type { WriteDeps } from "./write";

// D11: the catalog is small; revalidating every page is cheaper than tracking
// which category, related-product and search pages a change touches.
export function writeDeps(client: AdminClient): WriteDeps {
  return {
    check: () => checkAdmin(client),
    revalidate: () => revalidatePath("/", "layout"),
    logError: (context, code) => console.error(context, code ?? "unknown"),
  };
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

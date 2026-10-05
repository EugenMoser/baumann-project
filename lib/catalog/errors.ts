import { err, type Result } from "@/lib/result";
import type { CatalogError } from "./types";

type PostgrestLikeError = { code?: string; message: string };

export function toDbError(error: PostgrestLikeError): CatalogError {
  return { kind: "db_error", code: error.code || null, message: error.message };
}

// supabase-js reports most failures as values, but network errors can still
// throw depending on the fetch implementation; never let them escape.
export async function guard<T>(
  run: () => Promise<Result<T, CatalogError>>
): Promise<Result<T, CatalogError>> {
  try {
    return await run();
  } catch (cause) {
    return err({
      kind: "db_error",
      code: null,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

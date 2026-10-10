import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError, CertificateView } from "./types";

const rowSchema = z.object({
  standard: z.string(),
  title: z.string(),
  preview_path: z.string(),
  preview_width: z.number().int().positive(),
  preview_height: z.number().int().positive(),
  preview_alt: z.string(),
  certificate_document: z.array(
    z.object({ language: z.enum(["de", "en"]), storage_path: z.string() })
  ),
});

const LANGUAGE_ORDER = { de: 0, en: 1 } as const;

// Certificates for the quality page (spec D4); no draft state, RLS allows all rows.
export function listCertificates(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CertificateView[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("certificate")
      .select(
        "standard, title, preview_path, preview_width, preview_height, preview_alt, certificate_document(language, storage_path)"
      )
      .order("sort_order")
      .order("standard");
    if (error) return err(toDbError(error));
    const parsed = z.array(rowSchema).safeParse(data);
    if (!parsed.success)
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected certificate rows: ${parsed.error.message}`,
      });
    return ok(
      parsed.data.map((row) => ({
        standard: row.standard,
        title: row.title,
        preview: {
          storagePath: row.preview_path,
          width: row.preview_width,
          height: row.preview_height,
          altText: row.preview_alt,
        },
        documents: [...row.certificate_document]
          .sort(
            (a, b) => LANGUAGE_ORDER[a.language] - LANGUAGE_ORDER[b.language]
          )
          .map((d) => ({ language: d.language, storagePath: d.storage_path })),
      }))
    );
  });
}

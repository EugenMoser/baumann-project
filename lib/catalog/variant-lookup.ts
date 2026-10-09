import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError } from "./types";

export const ORDER_NUMBER_MAX = 40;

export type VariantMatch = {
  orderNumber: string;
  productName: string;
  categorySlug: string;
  productSlug: string;
};

// `?bestellnummer=` on /anfrage: first value, trimmed, 1–40 characters, otherwise ignored.
export function parseOrderNumberParam(
  raw: string | string[] | undefined
): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = (first ?? "").trim();
  return value === "" || value.length > ORDER_NUMBER_MAX ? null : value;
}

const rowSchema = z.object({
  order_number: z.string(),
  product_name: z.string(),
  category_slug: z.string(),
  product_slug: z.string(),
});

export function findVariant(
  q: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<VariantMatch, CatalogError>> {
  return guard(async () => {
    const { data, error } = await client.rpc("find_variant", { q });
    if (error) return err(toDbError(error));
    const parsed = z.array(rowSchema).safeParse(data);
    if (!parsed.success)
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected find_variant result: ${parsed.error.message}`,
      });
    const row = parsed.data[0];
    if (!row) return err({ kind: "not_found" });
    return ok({
      orderNumber: row.order_number,
      productName: row.product_name,
      categorySlug: row.category_slug,
      productSlug: row.product_slug,
    });
  });
}

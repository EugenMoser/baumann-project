import { z } from "zod";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

export type SearchQueryResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" };

const querySchema = z.string().transform((s) => s.replace(/\s+/g, " ").trim());

// `q` comes straight from the URL; it may be missing or repeated.
export function parseSearchQuery(
  raw: string | string[] | undefined
): SearchQueryResult {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = querySchema.parse(first ?? "");
  if (value === "") return { ok: false, reason: "empty" };
  if (value.length < SEARCH_MIN) return { ok: false, reason: "too_short" };
  if (value.length > SEARCH_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

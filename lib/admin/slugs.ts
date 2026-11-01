import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";

// `base` only contains [a-z0-9-], so it is safe inside a PostgREST filter;
// "*" is the like wildcard there.
const slugFilter = (base: string) => `slug.eq.${base},slug.like.${base}-*`;

/** Slugs in the category that equal `base` or start with `base-`. */
export async function takenProductSlugs(
  client: AdminClient,
  categoryId: number,
  base: string,
  excludeId: number | null
): Promise<Result<string[], AdminError>> {
  let query = client
    .from("product")
    .select("slug")
    .eq("category_id", categoryId)
    .or(slugFilter(base));
  if (excludeId !== null) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) return err(fromPg(error));
  return ok(data.map((r) => r.slug));
}

/** Slugs of all categories that equal `base` or start with `base-`. */
export async function takenCategorySlugs(
  client: AdminClient,
  base: string
): Promise<Result<string[], AdminError>> {
  const { data, error } = await client
    .from("category")
    .select("slug")
    .or(slugFilter(base));
  if (error) return err(fromPg(error));
  return ok(data.map((r) => r.slug));
}

/**
 * Re-runs `attempt` (which reads the taken slugs again) while a concurrent
 * save wins the unique constraint; gives up with the generic form error.
 */
export async function withSlugRetry<T>(
  attempt: () => Promise<Result<T, AdminError>>,
  tries = 3
): Promise<Result<T, AdminError>> {
  for (let n = 0; n < tries; n += 1) {
    const result = await attempt();
    if (
      result.ok ||
      result.error.kind !== "conflict" ||
      result.error.field !== "slug"
    )
      return result;
  }
  return err({ kind: "db_error", code: "23505" });
}

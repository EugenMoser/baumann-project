import { createServerSupabase } from "@/lib/supabase/server";

// Published slugs, so proxy.ts can turn away random catalog URLs before the
// ISR pages render and write one cache entry per URL to disk.
export type SlugSnapshot = {
  categories: ReadonlySet<string>;
  /** Keys are `<categorySlug>/<productSlug>`. */
  products: ReadonlySet<string>;
};

type Options = { minRefreshMs?: number; now?: () => number };
type Load = { generation: number; result: Promise<SlugSnapshot | null> };

export function createSlugIndex(
  load: () => Promise<SlugSnapshot>,
  { minRefreshMs = 10_000, now = Date.now }: Options = {}
) {
  let snapshot: SlugSnapshot | null = null;
  let lastAttempt = -Infinity;
  // Bumped by invalidate(); a load started before a bump may miss the write.
  let generation = 0;
  let inFlight: Load | null = null;

  // Resolves to null on failure; concurrent callers share one load.
  function refresh(): Load {
    if (inFlight) return inFlight;
    lastAttempt = now();
    const current: Load = {
      generation,
      result: Promise.resolve()
        .then(load)
        .then(
          (fresh) => {
            snapshot = fresh;
            return fresh;
          },
          (error: unknown) => {
            console.error("known-slugs: load failed", error);
            return null;
          }
        )
        .finally(() => {
          // Defensive: refresh() never replaces a running load.
          if (inFlight === current) inFlight = null;
        }),
    };
    inFlight = current;
    return current;
  }

  return {
    async isKnown(category: string, product?: string): Promise<boolean> {
      const has = (s: SlugSnapshot) =>
        product === undefined
          ? s.categories.has(category)
          : s.products.has(`${category}/${product}`);

      if (snapshot && has(snapshot)) return true;
      // A miss may be a slug published since the last load. The throttle keeps
      // a flood of random URLs from turning into a flood of queries.
      if (!inFlight && now() - lastAttempt < minRefreshMs) {
        return snapshot === null; // no data yet: fail open
      }
      const joined = refresh();
      let fresh = await joined.result;
      // An admin write landed while that load ran: its rows may be stale.
      if (fresh && !has(fresh) && joined.generation !== generation) {
        fresh = await refresh().result;
      }
      return fresh === null || has(fresh); // load failed: fail open
    },
    // After an admin write the next miss reloads at once, even inside the
    // throttle window or while an older load is still running, so a slug that
    // was just published or renamed does not 404.
    invalidate() {
      generation += 1;
      lastAttempt = -Infinity;
    },
  };
}

// Anon client: RLS hides drafts and archived products, which 404 anyway.
async function loadPublishedSlugs(): Promise<SlugSnapshot> {
  const client = createServerSupabase();
  const [categories, products] = await Promise.all([
    client.from("category").select("slug", { count: "exact" }),
    client
      .from("product")
      .select("slug, category!inner(slug)", { count: "exact" }),
  ]);
  if (categories.error) throw categories.error;
  if (products.error) throw products.error;
  // PostgREST caps rows per table (max_rows: 1000 in the local
  // supabase/config.toml; production follows PGRST_DB_MAX_ROWS). A cut-off
  // list would 404 real products, so above the cap every load fails and the
  // check silently turns off (fail open); paging with .range() would lift it.
  if (
    categories.data.length !== categories.count ||
    products.data.length !== products.count
  ) {
    throw new Error("known-slugs: slug list truncated");
  }
  return {
    categories: new Set(categories.data.map((c) => c.slug)),
    products: new Set(products.data.map((p) => `${p.category.slug}/${p.slug}`)),
  };
}

// proxy.ts and the admin Server Actions run in one process but in separate
// bundles with their own module instances; globalThis gives them one index.
// That sharing is a Next implementation detail (the proxy docs advise against
// relying on shared globals). If it stops, or several replicas run, only the
// 10 s throttle applies: a new slug can 404 for up to 10 s, nothing is cached.
// Writes outside the admin (catalog:import, Studio, service role, a local
// `pnpm dev` writing to the preview database) likewise reach the proxy within
// 10 s.
// In dev, `??=` keeps the old instance across HMR: restart after editing this
// file.
const shared = globalThis as {
  knownSlugs?: ReturnType<typeof createSlugIndex>;
};
export const knownSlugs = (shared.knownSlugs ??=
  createSlugIndex(loadPublishedSlugs));

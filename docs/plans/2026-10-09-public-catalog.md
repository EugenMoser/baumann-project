# Public Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the imported catalog as a public, cached, accessible website with home, category, product and search pages.

**Architecture:** Server components read through the existing `lib/catalog/*` functions (supabase-js, publishable key, RLS). Pure helpers in `lib/catalog/` build view data (related products, variant matrix, metadata, JSON-LD, image URLs) and are unit-tested; pages stay thin. Category and product pages use classic ISR (`revalidate = 3600`, empty `generateStaticParams`), home/overview/search render per request, and nothing touches the database during `next build`. Search is one Postgres function `search_catalog`.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Tailwind CSS 4, Supabase (Postgres 17, PostgREST), Zod 4, Vitest + Testing Library, pgTAP, Playwright + `@axe-core/playwright`, pnpm 10.

**Spec:** `docs/specs/2026-10-09-public-catalog-design.md` — read it before every task; FR-/SC-IDs below refer to it.

## Global Constraints

- TypeScript `strict: true`; no `any` without a comment explaining why.
- Zod for every external input: query string `q`, RPC results.
- All UI copy is German; code, identifiers, comments and commit messages are English.
- Never remove the demo banner or `noindex` (meta robots, `X-Robots-Tag`, `robots.txt`); no page may set its own `robots` metadata.
- AI-generated fields (`*_origin` = `ai` | `ai_edited`) are labelled in the UI.
- No customer data in tests or fixtures; test data uses the synthetic seed (`99xxx`).
- No images or DB dumps in the repo.
- Every new database object: explicit grants in its migration; functions `revoke execute … from public, anon, authenticated` first, then grant only what is needed.
- `pnpm db:types` after every migration; CI fails if `lib/supabase/database.types.ts` is stale.
- Next.js 16: read `node_modules/next/dist/docs/` for any API you are not sure about (ISR guide: `01-app/02-guides/incremental-static-regeneration.md`).
- No database access during `next build` (D2): `pnpm build` must succeed with the local stack stopped.
- Light theme only (D9). Responsive down to 360 px, no horizontal page scroll.
- Only new dependency: `@axe-core/playwright` (dev).
- TDD: write the failing test first, see it fail, then implement.
- Commit after each task with Conventional Commits on branch `feat/public-catalog` (WIP commits are allowed). Never push, never merge.

## Review Focus

1. **Search input with SQL `LIKE` wildcards or odd spacing** (`99%`, `_`, `6174-1`, `6174 - 1`): wildcards must match literally, spacing variants of an order number must still match exactly. → pgTAP in Task 1.
2. **Article numbers with a slash** (`99211/80`) in anchors, redirects and URLs: anchor `artikel-99211-80`, redirect target must point at it. → unit tests in Tasks 4 and 6.
3. **Products with missing data** (no colours, no images, no description, single article, no siblings): blocks shrink, nothing crashes, no broken `<img>`. → unit tests in Tasks 6/7, e2e in Task 8.
4. **Text that looks like markup** in names/descriptions (`<script>` in a description) inside JSON-LD: must be escaped. → unit test in Task 4.
5. **Database unreachable during a request**: generic error page, no SQL or stack in the HTML, details only in the server log. → unit test in Task 7.

---

### Task 1: Search function and seed additions

**Files:**

- Modify: `supabase/seed.sql`
- Create: `supabase/migrations/20261010090000_search_catalog.sql`
- Create: `supabase/tests/07_search.test.sql`
- Modify: `lib/supabase/database.types.ts` (generated)
- Create: `lib/catalog/search-query.ts`, `lib/catalog/search-query.test.ts`
- Create: `lib/catalog/search.ts`
- Modify: `lib/catalog/types.ts`
- Create: `tests/integration/search.test.ts`
- Modify: `docs/specs/2026-10-09-public-catalog-design.md` (D3 wording, see Step 9)

**Interfaces:**

- Produces:
  - SQL `public.search_catalog(q text, max_results integer default 50) returns table (category_slug text, product_slug text, name text, subtitle text, matched_numbers text[], match_kind text, rank real)`
  - `lib/catalog/types.ts`: `export type MatchKind = "exact_number" | "number" | "text"; export type SearchHit = { categorySlug: string; productSlug: string; name: string; subtitle: string | null; matchedNumbers: string[]; matchKind: MatchKind };`
  - `lib/catalog/search-query.ts`: `parseSearchQuery(raw: string | string[] | undefined): SearchQueryResult` where `type SearchQueryResult = { ok: true; value: string } | { ok: false; reason: "empty" | "too_short" | "too_long" }`; constants `SEARCH_MIN = 2`, `SEARCH_MAX = 100`
  - `lib/catalog/search.ts`: `searchCatalog(q: string, client?: CatalogClient): Promise<Result<SearchHit[], CatalogError>>`

- [ ] **Step 1: Extend the seed**

In `supabase/seed.sql`, add `description_origin` to the product insert and mark product 2 as AI-generated (needed for the AI label e2e test). Replace the product insert with:

```sql
insert into public.product (id, category_id, slug, name, subtitle, description, description_origin, material_id, status, sort_order) overriding system value values
  (1, 1, 'testkeil-mit-daempfung', 'Testkeil mit Dämpfung', 'für Beispielschlösser', 'Gedämpfter Keil für Möbeltüren. Beispieldaten.', 'human', 1, 'published', 0),
  (2, 2, 'testrohrschelle', 'Testrohrschelle', 'für Rohre bis 15 mm', 'Rohrschelle zur Befestigung an der Wand. Beispieldaten.', 'ai', 2, 'published', 0),
  (3, 1, 'testabdeckung', 'Testabdeckung', null, 'Abdeckkappe ohne Farbvarianten. Beispieldaten.', 'human', null, 'published', 1),
  (4, 1, 'entwurfsteil', 'Entwurfsteil', null, 'Noch nicht veröffentlicht.', 'human', null, 'draft', 2),
  (5, 2, 'altteil', 'Altteil', null, 'Nicht mehr im Sortiment.', 'human', null, 'archived', 1);
```

- [ ] **Step 2: Write the failing pgTAP test**

Create `supabase/tests/07_search.test.sql`:

```sql
begin;
select plan(11);

select ok(
  has_function_privilege('anon', 'public.search_catalog(text, integer)', 'execute'),
  'anon may execute search_catalog');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog('99010 - 1')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010 - 1']::text[])$$,
  'exact order number');
select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog(' 99010-1 ')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010 - 1']::text[])$$,
  'order number with different spacing is still exact');
select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog('99010')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010']::text[])$$,
  'exact article number reports the article number');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('99211/80 - 0')$$,
  $$values ('testrohrschelle'::text, 'exact_number'::text)$$,
  'order number with a slash');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('9901')$$,
  $$values ('testkeil-mit-daempfung'::text, 'number'::text)$$,
  'number prefix');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('Befestigung')$$,
  $$values ('testrohrschelle'::text, 'text'::text)$$,
  'German word from a description');
select results_eq(
  $$select product_slug from public.search_catalog('Testkeil 10')$$,
  $$values ('testkeil-mit-daempfung'::text)$$,
  'article name words find the product');
select is_empty(
  $$select 1 from public.search_catalog('99400')$$,
  'article of a draft product is not found');
select is_empty(
  $$select 1 from public.search_catalog('Entwurfsteil')$$,
  'draft product is not found by name');
select is_empty(
  $$select 1 from public.search_catalog('99%')$$,
  'LIKE wildcards in the query are literal');

select * from finish();
rollback;
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm db:reset && pnpm exec supabase test db`
Expected: FAIL in `07_search.test.sql` — `function public.search_catalog(...) does not exist`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261010090000_search_catalog.sql`:

```sql
-- Public catalog search (feature 4, D3). Runs with the caller's rights, so RLS
-- limits results to published products. The catalog is small (~300 articles,
-- ~600 variants): a scan of the variant view is fast enough.
create function public.search_catalog(q text, max_results integer default 50)
returns table (
  category_slug text,
  product_slug text,
  name text,
  subtitle text,
  matched_numbers text[],
  match_kind text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      regexp_replace(lower(btrim(q)), '\s+', '', 'g') as compact,
      websearch_to_tsquery('german', q) as tsq
  ),
  pattern as (
    -- Escape LIKE wildcards so they match literally.
    select compact,
           replace(replace(replace(compact, '\', '\\'), '%', '\%'), '_', '\_') || '%' as prefix,
           tsq
    from input
  ),
  number_hits as (
    select
      v.product_id,
      case
        when regexp_replace(lower(v.article_number), '\s+', '', 'g') = p.compact then v.article_number
        else v.order_number
      end as number,
      case
        when regexp_replace(lower(v.order_number), '\s+', '', 'g') = p.compact
          or regexp_replace(lower(v.article_number), '\s+', '', 'g') = p.compact
          then 'exact_number'
        else 'number'
      end as kind
    from public.variant v
    cross join pattern p
    where p.compact <> ''
      and regexp_replace(lower(v.order_number), '\s+', '', 'g') like p.prefix
  ),
  text_hits as (
    select pr.id as product_id, ts_rank(pr.search, p.tsq, 32) as r
    from public.product pr
    cross join pattern p
    where pr.search @@ p.tsq
    union all
    select a.product_id, ts_rank(to_tsvector('german', a.name), p.tsq, 32) * 0.5
    from public.article a
    cross join pattern p
    where a.name is not null and to_tsvector('german', a.name) @@ p.tsq
  ),
  hits as (
    select product_id, kind, number,
           (case kind when 'exact_number' then 3 else 2 end)::real as r
    from number_hits
    union all
    select product_id, 'text', null, r::real from text_hits
  ),
  per_product as (
    select
      product_id,
      (array_agg(kind order by r desc))[1] as match_kind,
      max(r) as rank,
      coalesce(
        array_agg(distinct number order by number) filter (where number is not null),
        '{}'::text[]
      ) as matched_numbers
    from hits
    group by product_id
  )
  select c.slug, pr.slug, pr.name, pr.subtitle, pp.matched_numbers, pp.match_kind, pp.rank
  from per_product pp
  join public.product pr on pr.id = pp.product_id
  join public.category c on c.id = pr.category_id
  order by pp.rank desc, pr.name
  limit least(greatest(coalesce(max_results, 50), 1), 100);
$$;

revoke execute on function public.search_catalog(text, integer) from public, anon, authenticated;
grant execute on function public.search_catalog(text, integer) to anon, authenticated, service_role;
```

- [ ] **Step 5: Run pgTAP to verify it passes**

Run: `pnpm db:reset && pnpm exec supabase test db`
Expected: all files PASS, including `07_search.test.sql` (11 tests). If `03_variant_search` or `04_rls` break because of the seed change, fix the expectation only if it asserted `description_origin`; otherwise revisit Step 1.

- [ ] **Step 6: Regenerate types**

Run: `pnpm db:types && git diff --stat lib/supabase/database.types.ts`
Expected: `search_catalog` appears under `Functions`.

- [ ] **Step 7: Write failing unit tests for query parsing**

Create `lib/catalog/search-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSearchQuery, SEARCH_MAX } from "./search-query";

describe("parseSearchQuery (FR-8, SC-8)", () => {
  it("trims and accepts a normal query", () => {
    expect(parseSearchQuery("  Rohrschelle ")).toEqual({
      ok: true,
      value: "Rohrschelle",
    });
  });

  it("collapses inner whitespace", () => {
    expect(parseSearchQuery("6174   -  1")).toEqual({
      ok: true,
      value: "6174 - 1",
    });
  });

  it.each([undefined, "", "   "])("rejects %j as empty", (raw) => {
    expect(parseSearchQuery(raw)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a single character as too short", () => {
    expect(parseSearchQuery("a")).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects more than SEARCH_MAX characters", () => {
    expect(parseSearchQuery("x".repeat(SEARCH_MAX + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("uses the first value when the parameter repeats", () => {
    expect(parseSearchQuery(["Keil", "Rohr"])).toEqual({
      ok: true,
      value: "Keil",
    });
  });
});
```

- [ ] **Step 8: Run to verify failure, then implement**

Run: `pnpm vitest run lib/catalog/search-query.test.ts` → FAIL (module not found).

Create `lib/catalog/search-query.ts`:

```ts
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
```

Run: `pnpm vitest run lib/catalog/search-query.test.ts` → PASS.

- [ ] **Step 9: Align the spec wording**

In `docs/specs/2026-10-09-public-catalog-design.md`, D3 item 2, replace "(uses the trigram index on `article_number`)" with "(a scan of the `variant` view; fast enough for ~600 variants)".

- [ ] **Step 10: Write the failing integration test for `searchCatalog`**

Create `tests/integration/search.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { searchCatalog } from "@/lib/catalog/search";
import type { Database } from "@/lib/supabase/database.types";

const unreachable = createClient<Database>(
  "http://127.0.0.1:9",
  "sb_publishable_unreachable",
  { auth: { persistSession: false } }
);

describe("searchCatalog (FR-8, SC-8)", () => {
  it("maps an exact order-number hit", async () => {
    expect(await searchCatalog("99010 - 1")).toEqual({
      ok: true,
      value: [
        {
          categorySlug: "moebelteile",
          productSlug: "testkeil-mit-daempfung",
          name: "Testkeil mit Dämpfung",
          subtitle: "für Beispielschlösser",
          matchedNumbers: ["99010 - 1"],
          matchKind: "exact_number",
        },
      ],
    });
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await searchCatalog("Gibtesnicht")).toEqual({ ok: true, value: [] });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await searchCatalog("Keil", unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});
```

Run: `pnpm exec vitest run --config vitest.integration.config.mts tests/integration/search.test.ts` → FAIL (module not found).

- [ ] **Step 11: Implement `searchCatalog`**

Append to `lib/catalog/types.ts`:

```ts
export type MatchKind = "exact_number" | "number" | "text";

export type SearchHit = {
  categorySlug: string;
  productSlug: string;
  name: string;
  subtitle: string | null;
  matchedNumbers: string[];
  matchKind: MatchKind;
};
```

Create `lib/catalog/search.ts`:

```ts
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError, SearchHit } from "./types";

const hitSchema = z.object({
  category_slug: z.string(),
  product_slug: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  matched_numbers: z.array(z.string()),
  match_kind: z.enum(["exact_number", "number", "text"]),
  rank: z.number(),
});

// `q` must come from parseSearchQuery (trimmed, 2–100 characters).
export function searchCatalog(
  q: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<SearchHit[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client.rpc("search_catalog", {
      q,
      max_results: 50,
    });
    if (error) return err(toDbError(error));
    const parsed = z.array(hitSchema).safeParse(data);
    if (!parsed.success) {
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected search_catalog result: ${parsed.error.message}`,
      });
    }
    return ok(
      parsed.data.map((h) => ({
        categorySlug: h.category_slug,
        productSlug: h.product_slug,
        name: h.name,
        subtitle: h.subtitle,
        matchedNumbers: h.matched_numbers,
        matchKind: h.match_kind,
      }))
    );
  });
}
```

Run: `pnpm db:test` → PASS (pgTAP + integration). Run `pnpm typecheck && pnpm lint` → exit 0.

- [ ] **Step 12: Commit**

```bash
git add supabase lib/supabase/database.types.ts lib/catalog tests/integration/search.test.ts docs/specs/2026-10-09-public-catalog-design.md
git commit -m "feat(db): search_catalog function and search query parsing"
```

---

### Task 2: Category texts through the importer (D5)

**Files:**

- Create: `supabase/migrations/20261010090100_import_category_texts.sql`
- Create: `supabase/tests/08_category_texts.test.sql`
- Modify: `scripts/import/payload.mts` (`PayloadCategory`)
- Modify: `scripts/import/categories.mts`
- Create: `tests/import/categories.test.ts`
- Modify: `docs/import.md`
- Modify: `lib/supabase/database.types.ts` (generated; no change expected for `private` functions)

**Interfaces:**

- Consumes: existing `public.import_catalog(payload jsonb)` from `supabase/migrations/20261009090000_import_functions.sql`
- Produces: `private.import_categories(categories jsonb) returns void`; `PayloadCategory` gains `intro_text: string; seo_title: string | null; seo_description: string | null`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/08_category_texts.test.sql`:

```sql
begin;
select plan(6);

-- Seed: moebelteile has an intro text, sanitaer gets an empty one.
update public.category set intro_text = '' where slug = 'sanitaer';

select private.import_categories($$[
  {"slug": "moebelteile", "name": "Möbelteile (Beispiel)", "sort_order": 0,
   "intro_text": "Neuer Text", "seo_title": "Titel", "seo_description": "Beschreibung"},
  {"slug": "sanitaer", "name": "Sanitärteile (Beispiel)", "sort_order": 1,
   "intro_text": "Text für Sanitär", "seo_title": null, "seo_description": null},
  {"slug": "neu", "name": "Neue Kategorie", "sort_order": 9,
   "intro_text": "Intro neu", "seo_title": null, "seo_description": null}
]$$::jsonb);

select is((select intro_text from public.category where slug = 'moebelteile'),
  'Beispieltext für die Kategorie Möbelteile.', 'a non-empty intro text is kept');
select is((select seo_title from public.category where slug = 'moebelteile'),
  'Titel', 'an empty SEO title is filled');
select is((select seo_description from public.category where slug = 'moebelteile'),
  'Beschreibung', 'an empty SEO description is filled');
select is((select intro_text from public.category where slug = 'sanitaer'),
  'Text für Sanitär', 'an empty intro text is filled');
select is((select intro_text from public.category where slug = 'neu'),
  'Intro neu', 'a new category gets its intro text');
select ok(
  not has_function_privilege('anon', 'private.import_categories(jsonb)', 'execute'),
  'anon may not execute import_categories');

select * from finish();
rollback;
```

Run: `pnpm db:reset && pnpm exec supabase test db` → FAIL (`private.import_categories` does not exist).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20261010090100_import_category_texts.sql`. Structure:

```sql
-- Category texts (feature 4, D5): the importer fills intro and SEO texts only
-- where they are empty, so edits made later (admin, feature 6) are kept.
create function private.import_categories(categories jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.category as cat (slug, name, sort_order, intro_text, seo_title, seo_description)
  select c.slug, c.name, c.sort_order, coalesce(c.intro_text, ''), c.seo_title, c.seo_description
  from jsonb_to_recordset(coalesce(categories, '[]'))
    as c(slug text, name text, sort_order integer, intro_text text, seo_title text, seo_description text)
  on conflict (slug) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    intro_text = case when cat.intro_text = '' then excluded.intro_text else cat.intro_text end,
    seo_title = coalesce(cat.seo_title, excluded.seo_title),
    seo_description = coalesce(cat.seo_description, excluded.seo_description);
$$;

revoke execute on function private.import_categories(jsonb) from public, anon, authenticated;
grant execute on function private.import_categories(jsonb) to service_role;
```

Then append `create or replace function public.import_catalog(payload jsonb)` — copy lines 7–247 of `supabase/migrations/20261009090000_import_functions.sql` **verbatim**, change `create function` to `create or replace function`, and replace only this block:

```sql
  insert into public.category (slug, name, sort_order)
  select c.slug, c.name, c.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'categories', '[]')) as c(slug text, name text, sort_order integer)
  on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;
```

with:

```sql
  perform private.import_categories(payload -> 'categories');
```

`create or replace` keeps the existing grants (service_role only). Do not touch `remove_catalog`. Check that the service role can use schema `private`: if the integration import test fails with `permission denied for schema private`, add `grant usage on schema private to service_role;` to this migration.

- [ ] **Step 3: Run pgTAP and the import integration tests**

Run: `pnpm db:reset && pnpm db:test`
Expected: PASS, including `08_category_texts` and the existing `tests/integration/import.test.ts` (its intro-text-kept assertion still holds).

- [ ] **Step 4: Extend the payload type and the category table (failing unit test first)**

Create `tests/import/categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../scripts/import/categories.mts";

describe("CATEGORIES (FR-9, SC-9)", () => {
  it("lists the five legacy categories with text fields", () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      "moebel",
      "halterung",
      "wasser",
      "lueftung",
      "elektro",
    ]);
    for (const c of CATEGORIES) {
      expect(typeof c.intro_text).toBe("string");
      expect(c.seo_title === null || c.seo_title.length > 0).toBe(true);
      expect(c.seo_description === null || c.seo_description.length > 0).toBe(
        true
      );
    }
  });
});
```

Run: `pnpm vitest run tests/import/categories.test.ts` → FAIL (type error / `intro_text` undefined).

In `scripts/import/payload.mts`:

```ts
export type PayloadCategory = {
  slug: string;
  name: string;
  sort_order: number;
  // Written only where the stored value is empty (D5 of the feature 4 spec).
  intro_text: string;
  seo_title: string | null;
  seo_description: string | null;
};
```

In `scripts/import/categories.mts`, replace the comment and add the fields to each entry. The texts are delivered by the developer; until then use `""` and `null`:

```ts
// Legacy category slugs are kept as URL segments (/produkte/moebel). Intro and
// SEO texts are written editorially; the importer stores them only where the
// database value is empty, so later edits win.
export const CATEGORIES: readonly PayloadCategory[] = [
  {
    slug: "moebel",
    name: "Möbel",
    sort_order: 0,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "halterung",
    name: "Halterungen",
    sort_order: 1,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "wasser",
    name: "Wasser",
    sort_order: 2,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "lueftung",
    name: "Lüftungen",
    sort_order: 3,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "elektro",
    name: "Elektro",
    sort_order: 4,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
];
```

Run: `pnpm vitest run tests/import` → PASS (fix any payload snapshot test that compares categories by adding the new fields to its expectation).

- [ ] **Step 5: Document**

In `docs/import.md`, add a short section "Category texts" after the re-import semantics: texts live in `scripts/import/categories.mts`; the importer writes `intro_text`, `seo_title`, `seo_description` only where the stored value is empty; to change an existing text before the admin exists, clear it in the database and re-run the import.

- [ ] **Step 6: Verify and commit**

Run: `pnpm db:types && pnpm typecheck && pnpm lint && pnpm test && pnpm db:test` → all exit 0.

```bash
git add supabase scripts/import tests/import docs/import.md lib/supabase/database.types.ts
git commit -m "feat(import): fill empty category intro and SEO texts"
```

---

### Task 3: Data layer extensions (thumbnails, counts, colours, related)

**Files:**

- Modify: `lib/catalog/types.ts`
- Create: `lib/catalog/related.ts`, `lib/catalog/related.test.ts`
- Create: `lib/catalog/media.ts`, `lib/catalog/media.test.ts`
- Modify: `lib/catalog/categories.ts`, `lib/catalog/product.ts`
- Modify: `tests/integration/catalog.test.ts`

**Interfaces:**

- Produces (in `lib/catalog/types.ts`):

```ts
export type ImageRef = {
  storagePath: string;
  width: number;
  height: number;
  altText: string;
};
export type CategoryListItem = CategorySummary & { productCount: number };
export type ProductSummary = {
  slug: string;
  name: string;
  subtitle: string | null;
  thumbnail: ImageRef | null;
};
export type ColorView = {
  id: number;
  name: string;
  ralReference: string | null;
  hexCode: string;
  family: string;
  suffix: string | null;
  isDefault: boolean;
};
export type VariantView = {
  orderNumber: string;
  articleNumber: string;
  suffix: string | null;
  isDefault: boolean;
  colorId: number | null;
};
export type MediaView = ImageRef & {
  altOrigin: ContentOrigin;
  role: MediaRole;
};
export type ProductPage = ProductSummary & {
  /* existing fields */ related: ProductSummary[];
};
```

- `lib/catalog/related.ts`: `selectRelated<T extends { slug: string }>(sorted: readonly T[], currentSlug: string, max?: number): T[]`
- `lib/catalog/media.ts`: `publicMediaUrl(storagePath: string, supabaseUrl?: string): string`; `pickThumbnail(media: readonly { role: MediaRole; sort_order: number; media: { storage_path: string; width: number; height: number; alt_text: string } }[]): ImageRef | null`
- `listCategories(): Promise<Result<CategoryListItem[], CatalogError>>`

- [ ] **Step 1: Failing unit tests for `selectRelated`**

Create `lib/catalog/related.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectRelated } from "./related";

const list = ["a", "b", "c", "d", "e", "f"].map((slug) => ({ slug }));
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);

describe("selectRelated (FR-6, SC-6)", () => {
  it("prefers neighbours, alternating after and before", () => {
    expect(slugs(selectRelated(list, "c"))).toEqual(["d", "b", "e", "a"]);
  });

  it("wraps around at the start of the list", () => {
    expect(slugs(selectRelated(list, "a"))).toEqual(["b", "f", "c", "e"]);
  });

  it("never returns the current product or duplicates", () => {
    expect(slugs(selectRelated(list.slice(0, 2), "a"))).toEqual(["b"]);
    expect(selectRelated([{ slug: "a" }], "a")).toEqual([]);
  });

  it("respects max", () => {
    expect(selectRelated(list, "c", 2)).toHaveLength(2);
  });
});
```

Run: `pnpm vitest run lib/catalog/related.test.ts` → FAIL.

- [ ] **Step 2: Implement `selectRelated`**

Create `lib/catalog/related.ts`:

```ts
// D10: up to `max` products of the same category, nearest by sort order first
// (after, then before), wrapping around the list.
export function selectRelated<T extends { slug: string }>(
  sorted: readonly T[],
  currentSlug: string,
  max = 4
): T[] {
  const index = sorted.findIndex((p) => p.slug === currentSlug);
  const n = sorted.length;
  if (index === -1) return sorted.slice(0, max);
  const picked: T[] = [];
  const seen = new Set<number>([index]);
  for (let d = 1; d < n && picked.length < max; d++) {
    for (const j of [(index + d) % n, (index - d + n) % n]) {
      if (picked.length < max && !seen.has(j)) {
        seen.add(j);
        picked.push(sorted[j]);
      }
    }
  }
  return picked;
}
```

Run → PASS.

- [ ] **Step 3: Failing unit tests for media helpers**

Create `lib/catalog/media.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickThumbnail, publicMediaUrl } from "./media";

const row = (
  role: "thumbnail" | "gallery",
  sort_order: number,
  path: string
) => ({
  role,
  sort_order,
  media: { storage_path: path, width: 800, height: 600, alt_text: path },
});

describe("publicMediaUrl (FR-10, SC-10)", () => {
  it("builds the public object URL of the catalog bucket", () => {
    expect(publicMediaUrl("products/a/b.webp", "https://api.example.com")).toBe(
      "https://api.example.com/storage/v1/object/public/catalog/products/a/b.webp"
    );
  });

  it("encodes each path segment but keeps the slashes", () => {
    expect(
      publicMediaUrl("products/ä b/x#1.webp", "https://api.example.com/")
    ).toBe(
      "https://api.example.com/storage/v1/object/public/catalog/products/%C3%A4%20b/x%231.webp"
    );
  });
});

describe("pickThumbnail", () => {
  it("prefers the first thumbnail by sort order", () => {
    expect(
      pickThumbnail([
        row("gallery", 0, "g"),
        row("thumbnail", 2, "t2"),
        row("thumbnail", 1, "t1"),
      ])
    ).toEqual({ storagePath: "t1", width: 800, height: 600, altText: "t1" });
  });

  it("falls back to the first gallery image, then null", () => {
    expect(
      pickThumbnail([row("gallery", 1, "g1"), row("gallery", 0, "g0")])
        ?.storagePath
    ).toBe("g0");
    expect(pickThumbnail([])).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implement media helpers**

Create `lib/catalog/media.ts`:

```ts
import { publicEnv } from "@/lib/env/public";
import type { ImageRef, MediaRole } from "./types";

type MediaRow = {
  role: MediaRole;
  sort_order: number;
  media: {
    storage_path: string;
    width: number;
    height: number;
    alt_text: string;
  };
};

// Files are served by the public `catalog` bucket (data model, access rules).
export function publicMediaUrl(
  storagePath: string,
  supabaseUrl: string = publicEnv.NEXT_PUBLIC_SUPABASE_URL
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/catalog/${path}`;
}

export function pickThumbnail(rows: readonly MediaRow[]): ImageRef | null {
  const byOrder = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const pick =
    byOrder.find((r) => r.role === "thumbnail") ??
    byOrder.find((r) => r.role === "gallery");
  if (!pick) return null;
  return {
    storagePath: pick.media.storage_path,
    width: pick.media.width,
    height: pick.media.height,
    altText: pick.media.alt_text,
  };
}
```

Run → PASS.

- [ ] **Step 5: Update the integration test expectations first (failing)**

In `tests/integration/catalog.test.ts`:

- `listCategories` expected value becomes:

```ts
[
  { slug: "moebelteile", name: "Möbelteile (Beispiel)", productCount: 2 },
  { slug: "sanitaer", name: "Sanitärteile (Beispiel)", productCount: 1 },
];
```

- `getCategoryPage("moebelteile")` products become:

```ts
[
  {
    slug: "testkeil-mit-daempfung",
    name: "Testkeil mit Dämpfung",
    subtitle: "für Beispielschlösser",
    thumbnail: {
      storagePath: "products/testkeil-1.webp",
      width: 800,
      height: 600,
      altText: "Testkeil mit Dämpfung, Seitenansicht",
    },
  },
  {
    slug: "testabdeckung",
    name: "Testabdeckung",
    subtitle: null,
    thumbnail: null,
  },
];
```

- In "returns the full product page" add:

```ts
expect(page.colors.map((c) => c.id)).toEqual([3, 1]);
expect(page.variants.map((v) => v.colorId)).toEqual([3, 1, 3, 1]);
expect(page.thumbnail?.storagePath).toBe("products/testkeil-1.webp");
expect(page.related.map((p) => p.slug)).toEqual(["testabdeckung"]);
```

- In "returns accessories and colourless variants" add:

```ts
expect(result.value.variants[0].colorId).toBeNull();
expect(result.value.related.map((p) => p.slug)).toEqual([
  "testkeil-mit-daempfung",
]);
```

Run: `pnpm db:test` → FAIL on these assertions.

- [ ] **Step 6: Implement the data-layer changes**

`lib/catalog/types.ts`: apply the types from **Interfaces** (add `ImageRef`, `CategoryListItem`; add `thumbnail` to `ProductSummary`; `id` to `ColorView`; `colorId` to `VariantView`; make `MediaView = ImageRef & { altOrigin: ContentOrigin; role: MediaRole }`; add `related: ProductSummary[]` to `ProductPage`).

`lib/catalog/categories.ts`:

```ts
const PRODUCT_TILE =
  "slug, name, subtitle, sort_order, product_media(role, sort_order, media(storage_path, width, height, alt_text))";

export function listCategories(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategoryListItem[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select("slug, name, product(slug)")
      .order("sort_order")
      .order("name");
    if (error) return err(toDbError(error));
    // RLS limits `product` to published rows for anon.
    return ok(
      data.map((c) => ({
        slug: c.slug,
        name: c.name,
        productCount: c.product.length,
      }))
    );
  });
}
```

In `getCategoryPage`, select `slug, name, intro_text, seo_title, seo_description, product(${PRODUCT_TILE})` and map each product to `{ slug, name, subtitle, thumbnail: pickThumbnail(p.product_media) }` after the existing sort. Export a shared helper in `categories.ts`:

```ts
export function toProductSummaries(
  rows: readonly {
    slug: string;
    name: string;
    subtitle: string | null;
    sort_order: number;
    product_media: Parameters<typeof pickThumbnail>[0];
  }[]
): ProductSummary[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de")
    )
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      subtitle: p.subtitle,
      thumbnail: pickThumbnail(p.product_media),
    }));
}
```

and export `PRODUCT_TILE` for `product.ts`.

`lib/catalog/product.ts`:

- Add `category_id` to `PRODUCT_SELECT` and `id` to the embedded `color(...)` select: `product_color(suffix, is_default, sort_order, color(id, name, ral_reference, hex_code, family))`.
- Variant query selects `order_number, article_number, suffix, is_default, color_id`; map `colorId: v.color_id`.
- Colours map `id: c.color.id`.
- After the variant query, load siblings:

```ts
const { data: siblings, error: siblingError } = await client
  .from("product")
  .select(PRODUCT_TILE)
  .eq("category_id", row.category_id);
if (siblingError) return err(toDbError(siblingError));
const related = selectRelated(toProductSummaries(siblings), row.slug);
```

- Return `thumbnail: pickThumbnail(row.product_media)` and `related`.
- Keep `media` mapping, typed as `MediaView`.

If the generated types make `color_id` nullable and `v.order_number` nullable, keep the existing `flatMap` null filter.

- [ ] **Step 7: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm db:test` → exit 0.

```bash
git add lib/catalog tests/integration/catalog.test.ts
git commit -m "feat(catalog): thumbnails, product counts, colour ids and related products"
```

---

### Task 4: Pure view helpers (anchors, text, metadata, variants, JSON-LD, AI label)

**Files:**

- Create: `lib/catalog/anchors.ts`, `lib/catalog/anchors.test.ts`
- Create: `lib/catalog/text.ts`, `lib/catalog/text.test.ts`
- Create: `lib/catalog/metadata.ts`, `lib/catalog/metadata.test.ts`
- Create: `lib/catalog/variants.ts`, `lib/catalog/variants.test.ts`
- Create: `lib/catalog/structured-data.ts`, `lib/catalog/structured-data.test.ts`
- Create: `lib/catalog/ai-label.ts`, `lib/catalog/ai-label.test.ts`
- Create: `lib/catalog/fixtures.ts` (test fixture builder for `ProductPage`, used by unit tests only)

**Interfaces:**

- Consumes: types from Task 3.
- Produces:
  - `articleAnchorId(articleNumber: string): string` → `"artikel-99211-80"`
  - `productPath(categorySlug: string, productSlug: string): string` → `"/produkte/c/p"`
  - `exactHitTarget(hits: readonly SearchHit[]): string | null` → `"/produkte/c/p#artikel-99010"` or `null`
  - `toParagraphs(text: string | null): string[][]` (paragraphs → lines)
  - `truncate(text: string, max?: number): string`
  - `productMetadata(page: ProductPage): { title: string; description: string }`
  - `categoryMetadata(page: CategoryPage): { title: string; description: string }`
  - `type ColorOption = { key: string; name: string; ralReference: string | null; hexCode: string; suffix: string | null }`
  - `type VariantMatrix = { options: ColorOption[]; defaultKey: string | null; byArticle: Record<string, { numbers: Record<string, string>; fallback: string }> }`
  - `buildVariantMatrix(page: Pick<ProductPage, "colors" | "variants" | "articles">): VariantMatrix`
  - `buildProductGroup(page: ProductPage, pageUrl: string, imageUrl: (path: string) => string): Record<string, unknown>`
  - `serializeJsonLd(data: unknown): string`
  - `aiLabelText(origin: ContentOrigin): string | null`
  - `makeProductPage(overrides?: Partial<ProductPage>): ProductPage` (fixtures)

- [ ] **Step 1: Fixture builder**

Create `lib/catalog/fixtures.ts`:

```ts
import type { ProductPage } from "./types";

// Synthetic product for unit tests (99xxx numbers, invented names).
export function makeProductPage(
  overrides: Partial<ProductPage> = {}
): ProductPage {
  return {
    slug: "testkeil",
    name: "Testkeil",
    subtitle: "für Beispielschlösser",
    thumbnail: null,
    description: "Erster Absatz.\n\nZweiter Absatz.",
    descriptionOrigin: "human",
    seoTitle: null,
    seoDescription: null,
    seoOrigin: "human",
    category: { slug: "moebel", name: "Möbel" },
    material: { code: "PA-6", name: "Polyamid 6" },
    materialNote: null,
    articles: [
      {
        articleNumber: "99010",
        name: "Testkeil 8 mm",
        description: null,
        note: null,
        material: null,
        materialNote: null,
        attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 8 }],
        packaging: [{ quantity: 100, label: null }],
      },
      {
        articleNumber: "99211/80",
        name: null,
        description: null,
        note: "mit Bohrung",
        material: null,
        materialNote: null,
        attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 10.5 }],
        packaging: [],
      },
    ],
    colors: [
      {
        id: 3,
        name: "braun",
        ralReference: null,
        hexCode: "#6B4423",
        family: "braun",
        suffix: "1",
        isDefault: true,
      },
      {
        id: 1,
        name: "weiß",
        ralReference: "ähnlich RAL 9016",
        hexCode: "#F4F4F4",
        family: "weiß",
        suffix: "2",
        isDefault: false,
      },
    ],
    variants: [
      {
        orderNumber: "99010 - 1",
        articleNumber: "99010",
        suffix: "1",
        isDefault: true,
        colorId: 3,
      },
      {
        orderNumber: "99010 - 2",
        articleNumber: "99010",
        suffix: "2",
        isDefault: false,
        colorId: 1,
      },
      {
        orderNumber: "99211/80 - 1",
        articleNumber: "99211/80",
        suffix: "1",
        isDefault: true,
        colorId: 3,
      },
      {
        orderNumber: "99211/80 - 2",
        articleNumber: "99211/80",
        suffix: "2",
        isDefault: false,
        colorId: 1,
      },
    ],
    media: [],
    accessories: [],
    related: [],
    ...overrides,
  };
}
```

- [ ] **Step 2: Failing tests for anchors**

Create `lib/catalog/anchors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { articleAnchorId, exactHitTarget, productPath } from "./anchors";
import type { SearchHit } from "./types";

const hit = (over: Partial<SearchHit>): SearchHit => ({
  categorySlug: "moebel",
  productSlug: "testkeil",
  name: "Testkeil",
  subtitle: null,
  matchedNumbers: [],
  matchKind: "text",
  ...over,
});

describe("anchors (FR-4, FR-8, SC-4, SC-8)", () => {
  it("maps slashes and spaces in article numbers", () => {
    expect(articleAnchorId("99010")).toBe("artikel-99010");
    expect(articleAnchorId("99211/80")).toBe("artikel-99211-80");
  });

  it("builds product paths", () => {
    expect(productPath("moebel", "testkeil")).toBe("/produkte/moebel/testkeil");
  });

  it("redirects a single exact hit to the article anchor", () => {
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99211/80 - 2"] }),
      ])
    ).toBe("/produkte/moebel/testkeil#artikel-99211-80");
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99010"] }),
      ])
    ).toBe("/produkte/moebel/testkeil#artikel-99010");
  });

  it("does not redirect for several hits or non-exact hits", () => {
    expect(
      exactHitTarget([
        hit({ matchKind: "number", matchedNumbers: ["99010 - 1"] }),
      ])
    ).toBeNull();
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99010"] }),
        hit({ productSlug: "anderes" }),
      ])
    ).toBeNull();
    expect(exactHitTarget([])).toBeNull();
  });
});
```

Run → FAIL. Then create `lib/catalog/anchors.ts`:

```ts
import type { SearchHit } from "./types";

export function articleAnchorId(articleNumber: string): string {
  return `artikel-${articleNumber.trim().replace(/[\s/]+/g, "-")}`;
}

export function productPath(categorySlug: string, productSlug: string): string {
  return `/produkte/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productSlug)}`;
}

// D4: exactly one product and an exact number hit → straight to the article.
// Order numbers are "article number - suffix" (data model, view `variant`).
export function exactHitTarget(hits: readonly SearchHit[]): string | null {
  if (hits.length !== 1) return null;
  const [only] = hits;
  if (only.matchKind !== "exact_number" || only.matchedNumbers.length === 0)
    return null;
  const articleNumber = only.matchedNumbers[0].split(" - ")[0];
  return `${productPath(only.categorySlug, only.productSlug)}#${articleAnchorId(articleNumber)}`;
}
```

Run → PASS.

- [ ] **Step 3: Failing tests for text helpers, then implement**

Create `lib/catalog/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toParagraphs, truncate } from "./text";

describe("toParagraphs (D8)", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(toParagraphs("A\nB\n\n  \nC")).toEqual([["A", "B"], ["C"]]);
  });

  it("returns nothing for null or whitespace", () => {
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs("  \n ")).toEqual([]);
  });
});

describe("truncate (D11)", () => {
  it("keeps short text and normalises whitespace", () => {
    expect(truncate("a  b\nc")).toBe("a b c");
  });

  it("cuts at a word boundary and adds an ellipsis", () => {
    const text = `${"Wort ".repeat(40)}Ende`;
    const result = truncate(text, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});
```

Create `lib/catalog/text.ts`:

```ts
// D8: descriptions are plain text; blank lines separate paragraphs.
export function toParagraphs(text: string | null): string[][] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0);
}

export function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}
```

Run both → PASS.

- [ ] **Step 4: Failing tests for metadata, then implement**

Create `lib/catalog/metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { categoryMetadata, productMetadata } from "./metadata";

describe("productMetadata (FR-12, SC-12)", () => {
  it("builds title and description from data", () => {
    expect(productMetadata(makeProductPage())).toEqual({
      title: "Testkeil",
      description:
        "Testkeil – für Beispielschlösser. Artikel 99010, 99211/80 in 2 Farben.",
    });
  });

  it("uses SEO overrides", () => {
    expect(
      productMetadata(makeProductPage({ seoTitle: "T", seoDescription: "D" }))
    ).toEqual({ title: "T", description: "D" });
  });

  it("shortens long article lists", () => {
    const page = makeProductPage({
      subtitle: null,
      colors: [],
      articles: ["1", "2", "3", "4"].map((n) => ({
        ...makeProductPage().articles[0],
        articleNumber: `9900${n}`,
      })),
    });
    expect(productMetadata(page).description).toBe(
      "Testkeil. Artikel 99001, 99002, 99003 u. a."
    );
  });
});

describe("categoryMetadata (FR-12, SC-12)", () => {
  const base = {
    slug: "moebel",
    name: "Möbel",
    introText: "",
    seoTitle: null,
    seoDescription: null,
    products: [],
  };

  it("falls back to a generic sentence without intro text", () => {
    expect(categoryMetadata(base)).toEqual({
      title: "Möbel",
      description: "Möbel: alle Produkte im Überblick.",
    });
  });

  it("uses the shortened intro text", () => {
    expect(
      categoryMetadata({ ...base, introText: "Kurzer Text." }).description
    ).toBe("Kurzer Text.");
  });
});
```

Create `lib/catalog/metadata.ts`:

```ts
import { truncate } from "./text";
import type { CategoryPage, ProductPage } from "./types";

type PageMeta = { title: string; description: string };

export function productMetadata(page: ProductPage): PageMeta {
  const numbers = page.articles.map((a) => a.articleNumber);
  const list = `${numbers.slice(0, 3).join(", ")}${numbers.length > 3 ? " u. a." : ""}`;
  const colours =
    page.colors.length > 1 ? ` in ${page.colors.length} Farben` : "";
  const lead = page.subtitle ? `${page.name} – ${page.subtitle}` : page.name;
  const sentence = `${lead}. Artikel ${list}${colours}`;
  return {
    title: page.seoTitle ?? page.name,
    description:
      page.seoDescription ??
      truncate(sentence.endsWith(".") ? sentence : `${sentence}.`),
  };
}

export function categoryMetadata(page: CategoryPage): PageMeta {
  return {
    title: page.seoTitle ?? page.name,
    description:
      page.seoDescription ??
      (page.introText.trim()
        ? truncate(page.introText)
        : `${page.name}: alle Produkte im Überblick.`),
  };
}
```

Run → PASS (adjust the trailing-dot logic only if a test shows a double period).

- [ ] **Step 5: Failing tests for the variant matrix, then implement**

Create `lib/catalog/variants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { buildVariantMatrix } from "./variants";

describe("buildVariantMatrix (FR-5, SC-5)", () => {
  it("maps every article to its order number per colour", () => {
    const matrix = buildVariantMatrix(makeProductPage());
    expect(matrix.options.map((o) => [o.key, o.name, o.suffix])).toEqual([
      ["color-3", "braun", "1"],
      ["color-1", "weiß", "2"],
    ]);
    expect(matrix.defaultKey).toBe("color-3");
    expect(matrix.byArticle["99211/80"]).toEqual({
      numbers: { "color-3": "99211/80 - 1", "color-1": "99211/80 - 2" },
      fallback: "99211/80 - 1",
    });
  });

  it("uses the bare article number without colours", () => {
    const page = makeProductPage({
      colors: [],
      variants: [
        {
          orderNumber: "99010",
          articleNumber: "99010",
          suffix: null,
          isDefault: true,
          colorId: null,
        },
      ],
      articles: [makeProductPage().articles[0]],
    });
    const matrix = buildVariantMatrix(page);
    expect(matrix.options).toEqual([]);
    expect(matrix.defaultKey).toBeNull();
    expect(matrix.byArticle["99010"]).toEqual({
      numbers: {},
      fallback: "99010",
    });
  });

  it("falls back to the first colour when no default is set", () => {
    const page = makeProductPage();
    const colors = page.colors.map((c) => ({ ...c, isDefault: false }));
    expect(buildVariantMatrix({ ...page, colors }).defaultKey).toBe("color-3");
  });
});
```

Create `lib/catalog/variants.ts`:

```ts
import type { ProductPage } from "./types";

export type ColorOption = {
  key: string;
  name: string;
  ralReference: string | null;
  hexCode: string;
  suffix: string | null;
};

export type VariantMatrix = {
  options: ColorOption[];
  defaultKey: string | null;
  byArticle: Record<
    string,
    { numbers: Record<string, string>; fallback: string }
  >;
};

const colorKey = (id: number) => `color-${id}`;

// D6: per article, the order number for each colour; `fallback` is what the
// server renders (default colour, or the bare article number).
export function buildVariantMatrix(
  page: Pick<ProductPage, "colors" | "variants" | "articles">
): VariantMatrix {
  const options = page.colors.map((c) => ({
    key: colorKey(c.id),
    name: c.name,
    ralReference: c.ralReference,
    hexCode: c.hexCode,
    suffix: c.suffix,
  }));
  const defaultColor = page.colors.find((c) => c.isDefault) ?? page.colors[0];
  const defaultKey = defaultColor ? colorKey(defaultColor.id) : null;

  const byArticle: VariantMatrix["byArticle"] = {};
  for (const article of page.articles) {
    const numbers: Record<string, string> = {};
    for (const v of page.variants) {
      if (v.articleNumber === article.articleNumber && v.colorId !== null) {
        numbers[colorKey(v.colorId)] = v.orderNumber;
      }
    }
    const fallback =
      (defaultKey && numbers[defaultKey]) ?? article.articleNumber;
    byArticle[article.articleNumber] = { numbers, fallback };
  }
  return { options, defaultKey, byArticle };
}
```

Run → PASS.

- [ ] **Step 6: Failing tests for JSON-LD, then implement**

Create `lib/catalog/structured-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { buildProductGroup, serializeJsonLd } from "./structured-data";

const url = "https://preview.example.com/produkte/moebel/testkeil";
const img = (p: string) => `https://cdn.example.com/${p}`;

describe("buildProductGroup (FR-7, SC-7)", () => {
  it("builds a ProductGroup with one variant per order number", () => {
    const data = buildProductGroup(
      makeProductPage({
        media: [
          {
            storagePath: "a.webp",
            width: 1,
            height: 1,
            altText: "x",
            altOrigin: "human",
            role: "thumbnail",
          },
        ],
      }),
      url,
      img
    );
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      productGroupID: "testkeil",
      name: "Testkeil",
      description: "Erster Absatz.\n\nZweiter Absatz.",
      url,
      image: ["https://cdn.example.com/a.webp"],
      variesBy: ["https://schema.org/color", "https://schema.org/size"],
      hasVariant: [
        {
          "@type": "Product",
          sku: "99010 - 1",
          name: "Testkeil 99010 - 1",
          color: "braun",
        },
        {
          "@type": "Product",
          sku: "99010 - 2",
          name: "Testkeil 99010 - 2",
          color: "weiß",
        },
        {
          "@type": "Product",
          sku: "99211/80 - 1",
          name: "Testkeil 99211/80 - 1",
          color: "braun",
        },
        {
          "@type": "Product",
          sku: "99211/80 - 2",
          name: "Testkeil 99211/80 - 2",
          color: "weiß",
        },
      ],
    });
  });

  it("omits empty fields and never invents offers", () => {
    const data = buildProductGroup(
      makeProductPage({
        description: null,
        subtitle: null,
        colors: [],
        articles: [makeProductPage().articles[0]],
        variants: [
          {
            orderNumber: "99010",
            articleNumber: "99010",
            suffix: null,
            isDefault: true,
            colorId: null,
          },
        ],
      }),
      url,
      img
    );
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("variesBy");
    expect(data).not.toHaveProperty("offers");
    expect(data.hasVariant).toEqual([
      { "@type": "Product", sku: "99010", name: "Testkeil 99010" },
    ]);
  });
});

describe("serializeJsonLd (Review Focus 4)", () => {
  it("escapes < so text cannot close the script tag", () => {
    const out = serializeJsonLd({
      description: "</script><script>alert(1)</script>",
    });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({
      description: "</script><script>alert(1)</script>",
    });
  });
});
```

Create `lib/catalog/structured-data.ts`:

```ts
import type { ProductPage } from "./types";

// Data model, "Structured data": ProductGroup + one Product per variant,
// sku = order number. No offers — the business works by inquiry.
export function buildProductGroup(
  page: ProductPage,
  pageUrl: string,
  imageUrl: (storagePath: string) => string
): Record<string, unknown> & { hasVariant: Record<string, unknown>[] } {
  const colorName = new Map(page.colors.map((c) => [c.id, c.name]));
  const variesBy = [
    ...(page.colors.length > 1 ? ["https://schema.org/color"] : []),
    ...(page.articles.length > 1 ? ["https://schema.org/size"] : []),
  ];
  const images = page.media.map((m) => imageUrl(m.storagePath));
  const description = page.description ?? page.subtitle;

  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    productGroupID: page.slug,
    name: page.name,
    ...(description ? { description } : {}),
    url: pageUrl,
    ...(images.length > 0 ? { image: images } : {}),
    ...(variesBy.length > 0 ? { variesBy } : {}),
    hasVariant: page.variants.map((v) => {
      const color = v.colorId === null ? undefined : colorName.get(v.colorId);
      return {
        "@type": "Product",
        sku: v.orderNumber,
        name: `${page.name} ${v.orderNumber}`,
        ...(color ? { color } : {}),
      };
    }),
  };
}

// JSON inside <script> must not contain "<" (e.g. "</script>").
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
```

Run → PASS.

- [ ] **Step 7: AI label text (FR-13), test first**

Create `lib/catalog/ai-label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aiLabelText } from "./ai-label";

describe("aiLabelText (FR-13, SC-13)", () => {
  it("labels ai and ai_edited, not human", () => {
    expect(aiLabelText("ai")).toBe("KI-generiert");
    expect(aiLabelText("ai_edited")).toBe(
      "KI-unterstützt, redaktionell bearbeitet"
    );
    expect(aiLabelText("human")).toBeNull();
  });
});
```

Create `lib/catalog/ai-label.ts`:

```ts
import type { ContentOrigin } from "./types";

export function aiLabelText(origin: ContentOrigin): string | null {
  switch (origin) {
    case "ai":
      return "KI-generiert";
    case "ai_edited":
      return "KI-unterstützt, redaktionell bearbeitet";
    case "human":
      return null;
  }
}
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint` → exit 0.

```bash
git add lib/catalog
git commit -m "feat(catalog): pure view helpers for anchors, metadata, variants and JSON-LD"
```

---

### Task 5: Design foundation and site shell (FR-1, D9, D12, D7 config)

**Files:**

- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `components/site/site-header.tsx`, `components/site/site-header.test.tsx`
- Create: `components/site/site-footer.tsx`, `components/site/site-footer.test.tsx`
- Create: `components/site/search-form.tsx`
- Create: `components/site/breadcrumb.tsx`, `components/site/breadcrumb.test.tsx`
- Modify: `app/not-found.tsx`, `app/error.tsx` (use tokens only)
- Modify: `next.config.ts`

**Interfaces:**

- Produces:
  - `SiteHeader({ branding }: { branding: Branding })`
  - `SiteFooter({ branding }: { branding: Branding })`
  - `SearchForm({ defaultValue?: string; size?: "compact" | "large"; id?: string })`
  - `Breadcrumb({ items }: { items: { label: string; href?: string }[] })`
  - Tailwind colour tokens: `paper`, `surface`, `ink`, `muted`, `line`, `accent`, `accent-strong` (classes like `bg-surface`, `text-muted`, `border-line`, `text-accent`)
  - Layout container class convention: `mx-auto w-full max-w-6xl px-4`

- [ ] **Step 1: Tokens**

Replace `app/globals.css` with:

```css
@import "tailwindcss";

/* Light theme only (feature 4 spec, D9). Calm, technical catalogue look. */
@theme {
  --color-paper: #ffffff;
  --color-surface: #f3f4f5;
  --color-ink: #15191d;
  --color-muted: #59626b;
  --color-line: #d8dce0;
  --color-accent: #1d5c96;
  --color-accent-strong: #154675;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Failing component tests**

Create `components/site/site-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { placeholderBranding } from "@/config/branding";
import { SiteHeader } from "./site-header";

describe("SiteHeader (FR-1, SC-1)", () => {
  it("renders wordmark, catalog link and a GET search form", () => {
    render(<SiteHeader branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: /Beispiel/ })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/produkte"
    );
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/suche");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
  });
});
```

Create `components/site/site-footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { placeholderBranding } from "@/config/branding";
import { SiteFooter } from "./site-footer";

describe("SiteFooter (FR-1, SC-1)", () => {
  it("links to the official site and the developer", () => {
    render(<SiteFooter branding={placeholderBranding} />);
    expect(
      screen.getByRole("link", { name: /offizielle Website/ })
    ).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: /Eugen Moser/ })).toHaveAttribute(
      "href",
      "https://eugen-moser.com"
    );
  });
});
```

Create `components/site/breadcrumb.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "./breadcrumb";

describe("Breadcrumb", () => {
  it("links all but the last item and marks the current page", () => {
    render(
      <Breadcrumb
        items={[{ label: "Produkte", href: "/produkte" }, { label: "Möbel" }]}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Brotkrumen" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/produkte"
    );
    expect(screen.getByText("Möbel")).toHaveAttribute("aria-current", "page");
  });
});
```

Run: `pnpm vitest run components/site` → FAIL.

- [ ] **Step 3: Implement the components**

`components/site/search-form.tsx`:

```tsx
import { SEARCH_MAX } from "@/lib/catalog/search-query";

type SearchFormProps = {
  defaultValue?: string;
  size?: "compact" | "large";
  id?: string;
};

// Plain GET form: works without JavaScript (spec D3).
export function SearchForm({
  defaultValue,
  size = "compact",
  id = "suche",
}: SearchFormProps) {
  const large = size === "large";
  return (
    <form
      role="search"
      action="/suche"
      method="get"
      className="flex w-full max-w-md gap-2"
    >
      <label htmlFor={id} className="sr-only">
        Suche nach Produkt, Artikel- oder Bestellnummer
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={SEARCH_MAX}
        placeholder="Produkt oder Artikelnummer"
        className={`min-w-0 flex-1 rounded-md border border-line bg-paper px-3 ${large ? "py-3 text-base" : "py-1.5 text-sm"}`}
      />
      <button
        type="submit"
        className={`rounded-md bg-accent px-4 font-medium text-paper hover:bg-accent-strong ${large ? "py-3" : "py-1.5 text-sm"}`}
      >
        Suchen
      </button>
    </form>
  );
}
```

`components/site/site-header.tsx`:

```tsx
import Link from "next/link";
import type { Branding } from "@/config/branding";
import { SearchForm } from "./search-form";

// Reads only branding, never the database (spec D12).
export function SiteHeader({ branding }: { branding: Branding }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {branding.shortName}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            Produktkatalog
          </span>
        </Link>
        <nav aria-label="Hauptnavigation">
          <Link
            href="/produkte"
            className="text-sm font-medium hover:text-accent"
          >
            Produkte
          </Link>
        </nav>
        <div className="w-full sm:ml-auto sm:w-auto">
          <SearchForm id="suche-header" />
        </div>
      </div>
    </header>
  );
}
```

`components/site/site-footer.tsx`:

```tsx
import type { Branding } from "@/config/branding";

export function SiteFooter({ branding }: { branding: Branding }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface text-sm text-muted">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:justify-between">
        <p>
          Vorschau, nicht indexiert.{" "}
          <a
            href={branding.officialSiteUrl}
            className="underline underline-offset-2 hover:text-accent"
          >
            Zur offiziellen Website von {branding.companyName}
          </a>
        </p>
        <p>
          Umsetzung:{" "}
          <a
            href={branding.developer.url}
            className="underline underline-offset-2 hover:text-accent"
          >
            {branding.developer.name}
          </a>
        </p>
      </div>
    </footer>
  );
}
```

`components/site/breadcrumb.tsx`:

```tsx
import Link from "next/link";

type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Brotkrumen" className="text-sm text-muted">
      <ol className="flex flex-wrap gap-x-2">
        <li>
          <Link href="/" className="hover:text-accent">
            Start
          </Link>
        </li>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex gap-x-2">
              <span aria-hidden="true">/</span>
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-accent">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "text-ink" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

Run: `pnpm vitest run components/site` → PASS.

- [ ] **Step 4: Root layout**

In `app/layout.tsx`, import `SiteHeader` and `SiteFooter` and render, keeping the banner first:

```tsx
<body className="flex min-h-full flex-col bg-paper font-sans text-ink">
  <DemoBanner branding={branding} />
  <SiteHeader branding={branding} />
  <div className="flex flex-1 flex-col">{children}</div>
  <SiteFooter branding={branding} />
</body>
```

Do not change `metadata.robots`. Run `pnpm vitest run components/demo-banner.test.tsx` → still PASS.

- [ ] **Step 5: Image config (D7)**

In `next.config.ts`, use the parsed env and add `images`:

```ts
const publicEnv = parsePublicEnv(process.env);
parseServerEnv(process.env);
const supabase = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    // Only the public catalog bucket of our own Supabase (spec D7).
    remotePatterns: [
      {
        protocol: supabase.protocol === "http:" ? "http" : "https",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/public/catalog/**",
      },
    ],
    // One day: keeps re-encoding work on the shared VPS low.
    minimumCacheTTL: 86_400,
  },
  headers() {
    /* unchanged */
  },
};
```

Do **not** set `dangerouslyAllowLocalIP`; local Storage images may not be optimised, which is acceptable (seed images do not exist as files).

- [ ] **Step 6: Error and 404 pages**

In `app/not-found.tsx` and `app/error.tsx`, keep the content; change link/button classes to `text-accent underline underline-offset-2`. No other change.

- [ ] **Step 7: Verify and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` (with the local stack **stopped**: `pnpm db:stop` first) → exit 0.

```bash
git add app components/site next.config.ts
git commit -m "feat(ui): design tokens, site header, footer and breadcrumb"
```

---

### Task 6: Catalog components

**Files:**

- Create in `components/catalog/`: `product-image.tsx`, `product-tile.tsx`, `category-tile.tsx`, `paragraphs.tsx`, `ai-label.tsx`, `gallery.tsx`, `article-table.tsx`, `color-selection.tsx` (client), `order-number-list.tsx`, `accessory-list.tsx`, `related-products.tsx`, `json-ld.tsx`
- Tests: `components/catalog/product-image.test.tsx`, `article-table.test.tsx`, `color-selection.test.tsx`, `order-number-list.test.tsx`, `ai-label.test.tsx`, `json-ld.test.tsx`

**Interfaces:**

- Consumes: Task 3 types, Task 4 helpers (`articleAnchorId`, `productPath`, `toParagraphs`, `buildVariantMatrix`, `VariantMatrix`, `ColorOption`, `aiLabelText`, `serializeJsonLd`), `publicMediaUrl`.
- Produces:
  - `ProductImage({ image, name, sizes, priority? }: { image: ImageRef | null; name: string; sizes: string; priority?: boolean })`
  - `ProductTile({ categorySlug, product }: { categorySlug: string; product: ProductSummary })`
  - `CategoryTile({ category }: { category: CategoryListItem })`
  - `Paragraphs({ text }: { text: string | null })`
  - `AiLabel({ origin }: { origin: ContentOrigin })`
  - `Gallery({ media, name }: { media: MediaView[]; name: string })`
  - `ArticleTable({ productName, articles, matrix }: { productName: string; articles: ArticleView[]; matrix: VariantMatrix })`
  - `ColorSelectionProvider({ defaultKey, children })`, `ColorPicker({ options }: { options: ColorOption[] })`, `SelectedOrderNumber({ numbers, fallback }: { numbers: Record<string, string>; fallback: string })`
  - `OrderNumberList({ page }: { page: Pick<ProductPage, "articles" | "variants" | "colors"> })`
  - `AccessoryList({ accessories }: { accessories: AccessoryView[] })`
  - `RelatedProducts({ categorySlug, products }: { categorySlug: string; products: ProductSummary[] })`
  - `JsonLd({ data }: { data: unknown })`

- [ ] **Step 1: Failing tests**

`components/catalog/product-image.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "./product-image";

describe("ProductImage (FR-10, SC-10)", () => {
  it("renders an image with intrinsic size and alt text", () => {
    render(
      <ProductImage
        image={{
          storagePath: "products/a.webp",
          width: 800,
          height: 600,
          altText: "Seitenansicht",
        }}
        name="Testkeil"
        sizes="100vw"
      />
    );
    const img = screen.getByRole("img", { name: "Seitenansicht" });
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "600");
  });

  it("renders a placeholder without an image element", () => {
    const { container } = render(
      <ProductImage image={null} name="Testkeil" sizes="100vw" />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });
});
```

`components/catalog/article-table.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { buildVariantMatrix } from "@/lib/catalog/variants";
import { ArticleTable } from "./article-table";

describe("ArticleTable (FR-4, SC-4)", () => {
  const page = makeProductPage();

  it("renders one row per article with anchor, attributes, note and packaging", () => {
    render(
      <ArticleTable
        productName={page.name}
        articles={page.articles}
        matrix={buildVariantMatrix(page)}
      />
    );
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Artikel-Nr.",
      "Bezeichnung",
      "Merkmale",
      "Verpackungseinheit",
      "Bestell-Nr.",
    ]);
    const slashRow = document.getElementById("artikel-99211-80");
    expect(slashRow).not.toBeNull();
    expect(slashRow).toHaveTextContent("Höhe: 10,5 mm");
    expect(slashRow).toHaveTextContent("mit Bohrung");
    expect(slashRow).toHaveTextContent("Testkeil"); // falls back to the product name
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "100 Stück"
    );
  });

  it("shows the default-colour order number without interaction", () => {
    render(
      <ArticleTable
        productName={page.name}
        articles={page.articles}
        matrix={buildVariantMatrix(page)}
      />
    );
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "99010 - 1"
    );
  });
});
```

`components/catalog/color-selection.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ColorPicker,
  ColorSelectionProvider,
  SelectedOrderNumber,
} from "./color-selection";

const options = [
  {
    key: "color-3",
    name: "braun",
    ralReference: null,
    hexCode: "#6B4423",
    suffix: "1",
  },
  {
    key: "color-1",
    name: "weiß",
    ralReference: "ähnlich RAL 9016",
    hexCode: "#F4F4F4",
    suffix: "2",
  },
];

describe("ColorPicker (FR-5, SC-5)", () => {
  it("switches the shown order numbers", () => {
    render(
      <ColorSelectionProvider defaultKey="color-3">
        <ColorPicker options={options} />
        <SelectedOrderNumber
          numbers={{ "color-3": "99010 - 1", "color-1": "99010 - 2" }}
          fallback="99010 - 1"
        />
      </ColorSelectionProvider>
    );
    expect(screen.getByText("99010 - 1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /braun/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /weiß/ }));
    expect(screen.getByText("99010 - 2")).toBeInTheDocument();
  });

  it("shows the fallback outside a provider", () => {
    render(<SelectedOrderNumber numbers={{}} fallback="99300" />);
    expect(screen.getByText("99300")).toBeInTheDocument();
  });
});
```

`components/catalog/order-number-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { OrderNumberList } from "./order-number-list";

describe("OrderNumberList (FR-5, D6)", () => {
  it("lists every order number with its colour as visible text", () => {
    render(<OrderNumberList page={makeProductPage()} />);
    for (const n of [
      "99010 - 1",
      "99010 - 2",
      "99211/80 - 1",
      "99211/80 - 2",
    ]) {
      expect(screen.getByText(n, { exact: false })).toBeVisible();
    }
    expect(
      screen.getByRole("heading", { name: "Alle Bestellnummern" })
    ).toBeInTheDocument();
  });
});
```

`components/catalog/ai-label.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiLabel } from "./ai-label";

describe("AiLabel (FR-13, SC-13)", () => {
  it("renders for ai and nothing for human", () => {
    const { container, rerender } = render(<AiLabel origin="ai" />);
    expect(screen.getByText("KI-generiert")).toBeInTheDocument();
    rerender(<AiLabel origin="human" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`components/catalog/json-ld.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./json-ld";

describe("JsonLd (FR-7, SC-7)", () => {
  it("renders escaped JSON in an ld+json script", () => {
    const { container } = render(<JsonLd data={{ name: "<b>" }} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(script?.innerHTML).toBe('{"name":"\\u003cb>"}');
  });
});
```

Run: `pnpm vitest run components/catalog` → FAIL.

- [ ] **Step 2: Implement leaf components**

`components/catalog/product-image.tsx`:

```tsx
import Image from "next/image";
import { publicMediaUrl } from "@/lib/catalog/media";
import type { ImageRef } from "@/lib/catalog/types";

type Props = {
  image: ImageRef | null;
  name: string;
  sizes: string;
  priority?: boolean;
};

// Missing images reduce the display, never break it (spec, error handling).
export function ProductImage({ image, name, sizes, priority = false }: Props) {
  if (!image) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-md bg-surface p-4 text-center text-sm text-muted">
        <span className="font-medium text-ink">{name}</span>
        <span>Kein Bild</span>
      </div>
    );
  }
  return (
    <Image
      src={publicMediaUrl(image.storagePath)}
      alt={image.altText}
      width={image.width}
      height={image.height}
      sizes={sizes}
      priority={priority}
      className="aspect-[4/3] w-full rounded-md bg-surface object-contain"
    />
  );
}
```

`components/catalog/paragraphs.tsx`:

```tsx
import { Fragment } from "react";
import { toParagraphs } from "@/lib/catalog/text";

export function Paragraphs({
  text,
  className,
}: {
  text: string | null;
  className?: string;
}) {
  const paragraphs = toParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div
      className={className ?? "flex max-w-prose flex-col gap-3 leading-relaxed"}
    >
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
```

`components/catalog/ai-label.tsx`:

```tsx
import { aiLabelText } from "@/lib/catalog/ai-label";
import type { ContentOrigin } from "@/lib/catalog/types";

export function AiLabel({ origin }: { origin: ContentOrigin }) {
  const text = aiLabelText(origin);
  if (!text) return null;
  return (
    <span className="inline-flex w-fit items-center rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">
      {text}
    </span>
  );
}
```

`components/catalog/json-ld.tsx`:

```tsx
import { serializeJsonLd } from "@/lib/catalog/structured-data";

export function JsonLd({ data }: { data: unknown }) {
  // serializeJsonLd escapes "<", so the content cannot close the script tag.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
```

`components/catalog/product-tile.tsx`:

```tsx
import Link from "next/link";
import { productPath } from "@/lib/catalog/anchors";
import type { ProductSummary } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

export function ProductTile({
  categorySlug,
  product,
}: {
  categorySlug: string;
  product: ProductSummary;
}) {
  return (
    <Link
      href={productPath(categorySlug, product.slug)}
      className="group flex flex-col gap-3 rounded-lg border border-line p-3 hover:border-accent"
    >
      <ProductImage
        image={product.thumbnail}
        name={product.name}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
      />
      <span className="flex flex-col">
        <span className="font-medium group-hover:text-accent">
          {product.name}
        </span>
        {product.subtitle && (
          <span className="text-sm text-muted">{product.subtitle}</span>
        )}
      </span>
    </Link>
  );
}
```

`components/catalog/category-tile.tsx`:

```tsx
import Link from "next/link";
import type { CategoryListItem } from "@/lib/catalog/types";

export function CategoryTile({ category }: { category: CategoryListItem }) {
  return (
    <Link
      href={`/produkte/${encodeURIComponent(category.slug)}`}
      className="group flex flex-col justify-between gap-6 rounded-lg border border-line bg-surface p-5 hover:border-accent"
    >
      <span className="text-lg font-semibold group-hover:text-accent">
        {category.name}
      </span>
      <span className="font-mono text-sm text-muted">
        {category.productCount}{" "}
        {category.productCount === 1 ? "Produkt" : "Produkte"}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Colour selection (the only client component)**

`components/catalog/color-selection.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { ColorOption } from "@/lib/catalog/variants";

type Selection = { selected: string; select: (key: string) => void };

const SelectionContext = createContext<Selection | null>(null);

export function ColorSelectionProvider({
  defaultKey,
  children,
}: {
  defaultKey: string;
  children: ReactNode;
}) {
  const [selected, select] = useState(defaultKey);
  return (
    <SelectionContext value={{ selected, select }}>{children}</SelectionContext>
  );
}

// Without JavaScript the server-rendered default stays visible (spec D6).
export function ColorPicker({ options }: { options: ColorOption[] }) {
  const selection = useContext(SelectionContext);
  const name = useId();
  if (!selection) return null;
  const current = options.find((o) => o.key === selection.selected);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Farbe</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.key}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm has-[input:checked]:border-accent has-[input:checked]:bg-surface has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={name}
              value={o.key}
              checked={selection.selected === o.key}
              onChange={() => selection.select(o.key)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="size-5 rounded-full border border-line"
              style={{ backgroundColor: o.hexCode }}
            />
            <span>{o.name}</span>
            {o.suffix !== null && (
              <span className="font-mono text-muted">-{o.suffix}</span>
            )}
            {o.ralReference && (
              <span className="text-xs text-muted">({o.ralReference})</span>
            )}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {current ? `Bestellnummern für Farbe ${current.name}` : ""}
      </p>
    </fieldset>
  );
}

export function SelectedOrderNumber({
  numbers,
  fallback,
}: {
  numbers: Record<string, string>;
  fallback: string;
}) {
  const selection = useContext(SelectionContext);
  const value = (selection && numbers[selection.selected]) ?? fallback;
  return <span className="font-mono">{value}</span>;
}
```

- [ ] **Step 4: Article table, order list, gallery, accessories, related**

`components/catalog/article-table.tsx`:

```tsx
import { articleAnchorId } from "@/lib/catalog/anchors";
import type { ArticleView } from "@/lib/catalog/types";
import type { VariantMatrix } from "@/lib/catalog/variants";
import { SelectedOrderNumber } from "./color-selection";

const number = new Intl.NumberFormat("de-DE");

function formatValue(value: number | string, unit: string | null): string {
  const text = typeof value === "number" ? number.format(value) : value;
  return unit ? `${text} ${unit}` : text;
}

export function ArticleTable({
  productName,
  articles,
  matrix,
}: {
  productName: string;
  articles: ArticleView[];
  matrix: VariantMatrix;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Artikel von {productName}</caption>
        <thead className="bg-surface text-muted">
          <tr>
            {[
              "Artikel-Nr.",
              "Bezeichnung",
              "Merkmale",
              "Verpackungseinheit",
              "Bestell-Nr.",
            ].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => {
            const variants = matrix.byArticle[a.articleNumber] ?? {
              numbers: {},
              fallback: a.articleNumber,
            };
            return (
              <tr
                key={a.articleNumber}
                id={articleAnchorId(a.articleNumber)}
                className="scroll-mt-24 border-t border-line align-top target:bg-surface"
              >
                <th scope="row" className="px-3 py-2 font-mono font-medium">
                  {a.articleNumber}
                </th>
                <td className="px-3 py-2">{a.name ?? productName}</td>
                <td className="px-3 py-2">
                  <ul className="flex flex-col gap-0.5">
                    {a.attributes.map((attr) => (
                      <li key={attr.key}>
                        {attr.label}: {formatValue(attr.value, attr.unit)}
                      </li>
                    ))}
                    {a.material && (
                      <li>
                        Material: {a.material.code}
                        {a.materialNote ? `, ${a.materialNote}` : ""}
                      </li>
                    )}
                    {a.note && <li className="text-muted">{a.note}</li>}
                    {a.description && (
                      <li className="text-muted">{a.description}</li>
                    )}
                  </ul>
                </td>
                <td className="px-3 py-2">
                  {a.packaging.length > 0
                    ? a.packaging
                        .map(
                          (p) =>
                            `${number.format(p.quantity)} ${p.label ?? "Stück"}`
                        )
                        .join(" / ")
                    : "–"}
                </td>
                <td className="px-3 py-2">
                  <SelectedOrderNumber
                    numbers={variants.numbers}
                    fallback={variants.fallback}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

`components/catalog/order-number-list.tsx`:

```tsx
import type { ProductPage } from "@/lib/catalog/types";

// Every SKU of the JSON-LD as visible text (spec D6, data model).
export function OrderNumberList({
  page,
}: {
  page: Pick<ProductPage, "articles" | "variants" | "colors">;
}) {
  const colorName = new Map(page.colors.map((c) => [c.id, c.name]));
  return (
    <section aria-labelledby="bestellnummern" className="flex flex-col gap-3">
      <h2 id="bestellnummern" className="text-lg font-semibold">
        Alle Bestellnummern
      </h2>
      <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {page.variants.map((v) => (
          <li key={v.orderNumber}>
            <span className="font-mono">{v.orderNumber}</span>
            {v.colorId !== null && colorName.has(v.colorId) && (
              <span className="text-muted"> – {colorName.get(v.colorId)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`components/catalog/gallery.tsx`:

```tsx
import type { MediaView } from "@/lib/catalog/types";
import { ProductImage } from "./product-image";

export function Gallery({ media, name }: { media: MediaView[]; name: string }) {
  const [first, ...rest] = media;
  return (
    <div className="flex flex-col gap-3">
      <ProductImage
        image={first ?? null}
        name={name}
        sizes="(min-width: 1024px) 50vw, 100vw"
        priority
      />
      {rest.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {rest.map((m) => (
            <li key={m.storagePath}>
              <ProductImage
                image={m}
                name={name}
                sizes="(min-width: 1024px) 16vw, 33vw"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`components/catalog/accessory-list.tsx`:

```tsx
import Link from "next/link";
import { articleAnchorId, productPath } from "@/lib/catalog/anchors";
import type { AccessoryView } from "@/lib/catalog/types";

export function AccessoryList({
  accessories,
}: {
  accessories: AccessoryView[];
}) {
  if (accessories.length === 0) return null;
  return (
    <section aria-labelledby="zubehoer" className="flex flex-col gap-3">
      <h2 id="zubehoer" className="text-lg font-semibold">
        Passendes Zubehör
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {accessories.map((a) => (
          <li key={a.articleNumber}>
            <Link
              href={`${productPath(a.categorySlug, a.productSlug)}#${articleAnchorId(a.articleNumber)}`}
              className="text-accent underline underline-offset-2"
            >
              <span className="font-mono">{a.articleNumber}</span>{" "}
              {a.name ?? a.productName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`components/catalog/related-products.tsx`:

```tsx
import type { ProductSummary } from "@/lib/catalog/types";
import { ProductTile } from "./product-tile";

export function RelatedProducts({
  categorySlug,
  products,
}: {
  categorySlug: string;
  products: ProductSummary[];
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="verwandt" className="flex flex-col gap-4">
      <h2 id="verwandt" className="text-lg font-semibold">
        Weitere Produkte dieser Kategorie
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.slug}>
            <ProductTile categorySlug={categorySlug} product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run components && pnpm typecheck && pnpm lint` → exit 0. If `next/image` fails in jsdom, mock it in the test file only: `vi.mock("next/image", () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => { const { priority: _p, ...rest } = props; return <img {...rest} />; } }))` — with an eslint-disable comment for `@next/next/no-img-element` explaining it is a test double.

```bash
git add components/catalog
git commit -m "feat(ui): catalog components with colour picker and article table"
```

---

### Task 7: Pages, loaders, ISR and metadata

**Files:**

- Create: `lib/catalog/load.ts`, `lib/catalog/load.test.ts`
- Modify: `app/page.tsx`
- Create: `app/produkte/page.tsx`
- Create: `app/produkte/[category]/page.tsx`
- Create: `app/produkte/[category]/[product]/page.tsx`
- Create: `app/suche/page.tsx`

**Interfaces:**

- Consumes: everything above.
- Produces:
  - `unwrap<T>(result: Result<T, CatalogError>, context: string): T` (calls `notFound()` or throws a generic `Error`)
  - `loadCategories(): Promise<CategoryListItem[]>`, `loadCategoryPage(slug: string): Promise<CategoryPage>`, `loadProductPage(category: string, product: string): Promise<ProductPage>` — each wrapped in React `cache()`

- [ ] **Step 1: Failing loader tests (SC-14, Review Focus 5)**

Create `lib/catalog/load.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { unwrap } from "./load";

afterEach(() => vi.restoreAllMocks());

describe("unwrap (FR-14, SC-14)", () => {
  it("returns the value of an ok result", () => {
    expect(unwrap({ ok: true, value: 42 }, "test")).toBe(42);
  });

  it("maps not_found to notFound()", () => {
    expect(() =>
      unwrap({ ok: false, error: { kind: "not_found" } }, "test")
    ).toThrow("NEXT_NOT_FOUND");
  });

  it("logs db errors and throws a generic error without details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let thrown: unknown;
    try {
      unwrap(
        {
          ok: false,
          error: {
            kind: "db_error",
            code: "42P01",
            message: 'relation "x" does not exist',
          },
        },
        "product page"
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Katalogdaten konnten nicht geladen werden."
    );
    expect((thrown as Error).message).not.toContain("relation");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("product page"),
      "42P01",
      'relation "x" does not exist'
    );
  });
});
```

Run: `pnpm vitest run lib/catalog/load.test.ts` → FAIL.

- [ ] **Step 2: Implement loaders**

Create `lib/catalog/load.ts`:

```ts
import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Result } from "@/lib/result";
import { getCategoryPage, listCategories } from "./categories";
import { getProductPage } from "./product";
import type { CatalogError } from "./types";

// FR-14: not_found → 404; db_error → logged here, generic error to the page.
export function unwrap<T>(result: Result<T, CatalogError>, context: string): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") notFound();
  console.error(
    `[catalog] ${context} failed:`,
    result.error.code,
    result.error.message
  );
  throw new Error("Katalogdaten konnten nicht geladen werden.");
}

// cache(): generateMetadata and the page share one database round trip.
export const loadCategories = cache(async () =>
  unwrap(await listCategories(), "category list")
);

export const loadCategoryPage = cache(async (slug: string) =>
  unwrap(await getCategoryPage(slug), `category page ${slug}`)
);

export const loadProductPage = cache(
  async (category: string, product: string) =>
    unwrap(
      await getProductPage(category, product),
      `product page ${category}/${product}`
    )
);
```

Run → PASS.

- [ ] **Step 3: Home and overview (rendered per request, D2)**

`app/page.tsx`:

```tsx
import { connection } from "next/server";
import { CategoryTile } from "@/components/catalog/category-tile";
import { SearchForm } from "@/components/site/search-form";
import { branding } from "@/config/branding";
import { loadCategories } from "@/lib/catalog/load";

export default async function HomePage() {
  await connection(); // per request: no database access during the build (D2)
  const categories = await loadCategories();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12">
      <section className="flex flex-col gap-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Produktkatalog
        </p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Kunststoff-Spritzgussteile von {branding.companyName}
        </h1>
        <p className="max-w-prose text-muted">
          Alle Produkte mit Artikelnummern, Maßen, Farben und Bestellnummern.
          Suchen Sie nach Produktname oder direkt nach einer Artikel- oder
          Bestellnummer.
        </p>
        <SearchForm size="large" id="suche-start" />
      </section>
      <section aria-labelledby="kategorien" className="flex flex-col gap-4">
        <h2 id="kategorien" className="text-xl font-semibold">
          Kategorien
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <CategoryTile category={c} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

`app/produkte/page.tsx`:

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import { CategoryTile } from "@/components/catalog/category-tile";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { loadCategories } from "@/lib/catalog/load";

export const metadata: Metadata = {
  title: "Produkte",
  description: "Alle Produktkategorien im Überblick.",
};

export default async function ProductsPage() {
  await connection();
  const categories = await loadCategories();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <Breadcrumb items={[{ label: "Produkte" }]} />
      <h1 className="text-3xl font-semibold tracking-tight">Produkte</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li key={c.slug}>
            <CategoryTile category={c} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Category page (ISR, D1)**

`app/produkte/[category]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Paragraphs } from "@/components/catalog/paragraphs";
import { ProductTile } from "@/components/catalog/product-tile";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { loadCategoryPage } from "@/lib/catalog/load";
import { categoryMetadata } from "@/lib/catalog/metadata";

// D1: rendered on first request, cached, refreshed after at most one hour.
export const revalidate = 3600;

export function generateStaticParams(): { category: string }[] {
  return []; // nothing at build time (D2)
}

export async function generateMetadata({
  params,
}: PageProps<"/produkte/[category]">): Promise<Metadata> {
  const { category } = await params;
  return categoryMetadata(await loadCategoryPage(category));
}

export default async function CategoryPage({
  params,
}: PageProps<"/produkte/[category]">) {
  const { category } = await params;
  const page = await loadCategoryPage(category);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <Breadcrumb
        items={[{ label: "Produkte", href: "/produkte" }, { label: page.name }]}
      />
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
        <Paragraphs
          text={page.introText}
          className="flex max-w-prose flex-col gap-3 leading-relaxed text-muted"
        />
      </header>
      {page.products.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.products.map((p) => (
            <li key={p.slug}>
              <ProductTile categorySlug={page.slug} product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">
          In dieser Kategorie sind noch keine Produkte veröffentlicht.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Product page (ISR, D1)**

`app/produkte/[category]/[product]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AccessoryList } from "@/components/catalog/accessory-list";
import { AiLabel } from "@/components/catalog/ai-label";
import { ArticleTable } from "@/components/catalog/article-table";
import {
  ColorPicker,
  ColorSelectionProvider,
} from "@/components/catalog/color-selection";
import { Gallery } from "@/components/catalog/gallery";
import { JsonLd } from "@/components/catalog/json-ld";
import { OrderNumberList } from "@/components/catalog/order-number-list";
import { Paragraphs } from "@/components/catalog/paragraphs";
import { RelatedProducts } from "@/components/catalog/related-products";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { branding } from "@/config/branding";
import { productPath } from "@/lib/catalog/anchors";
import { loadProductPage } from "@/lib/catalog/load";
import { publicMediaUrl } from "@/lib/catalog/media";
import { productMetadata } from "@/lib/catalog/metadata";
import { buildProductGroup } from "@/lib/catalog/structured-data";
import { buildVariantMatrix } from "@/lib/catalog/variants";
import { publicEnv } from "@/lib/env/public";

export const revalidate = 3600;

export function generateStaticParams(): {
  category: string;
  product: string;
}[] {
  return [];
}

type Props = PageProps<"/produkte/[category]/[product]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, product } = await params;
  return productMetadata(await loadProductPage(category, product));
}

export default async function ProductPage({ params }: Props) {
  const { category, product } = await params;
  const page = await loadProductPage(category, product);
  const matrix = buildVariantMatrix(page);
  const url = new URL(
    productPath(page.category.slug, page.slug),
    publicEnv.NEXT_PUBLIC_SITE_URL
  ).toString();
  const table = (
    <ArticleTable
      productName={page.name}
      articles={page.articles}
      matrix={matrix}
    />
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <JsonLd data={buildProductGroup(page, url, (p) => publicMediaUrl(p))} />
      <Breadcrumb
        items={[
          { label: "Produkte", href: "/produkte" },
          {
            label: page.category.name,
            href: `/produkte/${encodeURIComponent(page.category.slug)}`,
          },
          { label: page.name },
        ]}
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <Gallery media={page.media} name={page.name} />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
          {page.subtitle && (
            <p className="text-lg text-muted">{page.subtitle}</p>
          )}
          {page.description && (
            <div className="flex flex-col gap-2">
              <AiLabel origin={page.descriptionOrigin} />
              <Paragraphs text={page.description} />
            </div>
          )}
          {page.material && (
            <p className="text-sm">
              <span className="text-muted">Material: </span>
              {page.material.name} ({page.material.code})
              {page.materialNote ? `, ${page.materialNote}` : ""}
            </p>
          )}
          <a
            href={branding.officialSiteUrl}
            className="w-fit text-sm text-accent underline underline-offset-2"
          >
            Anfrage über die offizielle Website
          </a>
        </div>
      </div>

      <section aria-labelledby="artikel" className="flex flex-col gap-4">
        <h2 id="artikel" className="text-lg font-semibold">
          Artikel
        </h2>
        {matrix.defaultKey ? (
          <ColorSelectionProvider defaultKey={matrix.defaultKey}>
            <ColorPicker options={matrix.options} />
            {table}
          </ColorSelectionProvider>
        ) : (
          table
        )}
      </section>

      <OrderNumberList page={page} />
      <AccessoryList accessories={page.accessories} />
      <RelatedProducts
        categorySlug={page.category.slug}
        products={page.related}
      />
    </main>
  );
}
```

Note: `ColorPicker` must be a child of `ColorSelectionProvider`; `ArticleTable` is a server component that renders the client `SelectedOrderNumber` — allowed because it is passed as a child of the client provider.

- [ ] **Step 6: Search page (per request, D3/D4)**

`app/suche/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { SearchForm } from "@/components/site/search-form";
import { exactHitTarget, productPath } from "@/lib/catalog/anchors";
import { unwrap } from "@/lib/catalog/load";
import { searchCatalog } from "@/lib/catalog/search";
import {
  parseSearchQuery,
  SEARCH_MAX,
  SEARCH_MIN,
} from "@/lib/catalog/search-query";

export const metadata: Metadata = {
  title: "Suche",
  description: "Suche nach Produkten, Artikel- und Bestellnummern.",
};

const HINTS = {
  empty:
    "Geben Sie einen Produktnamen, eine Artikel- oder eine Bestellnummer ein.",
  too_short: `Bitte mindestens ${SEARCH_MIN} Zeichen eingeben.`,
  too_long: `Bitte höchstens ${SEARCH_MAX} Zeichen eingeben.`,
} as const;

export default async function SearchPage({
  searchParams,
}: PageProps<"/suche">) {
  const { q } = await searchParams;
  const query = parseSearchQuery(q);
  const raw = typeof q === "string" ? q : Array.isArray(q) ? (q[0] ?? "") : "";

  if (!query.ok) {
    return (
      <SearchShell defaultValue={raw}>
        <p className="text-muted">{HINTS[query.reason]}</p>
      </SearchShell>
    );
  }

  const hits = unwrap(await searchCatalog(query.value), "search");
  const target = exactHitTarget(hits);
  if (target) redirect(target);

  return (
    <SearchShell defaultValue={query.value}>
      <p aria-live="polite" className="text-sm text-muted">
        {hits.length === 0
          ? `Keine Treffer für „${query.value}“.`
          : `${hits.length} ${hits.length === 1 ? "Treffer" : "Treffer"} für „${query.value}“`}
      </p>
      {hits.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {hits.map((h) => (
            <li key={`${h.categorySlug}/${h.productSlug}`} className="p-4">
              <Link
                href={productPath(h.categorySlug, h.productSlug)}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                {h.name}
              </Link>
              {h.subtitle && <p className="text-sm text-muted">{h.subtitle}</p>}
              {h.matchedNumbers.length > 0 && (
                <p className="mt-1 font-mono text-sm">
                  {h.matchedNumbers.slice(0, 5).join(", ")}
                  {h.matchedNumbers.length > 5 ? " …" : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SearchShell>
  );
}

function SearchShell({
  defaultValue,
  children,
}: {
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <Breadcrumb items={[{ label: "Suche" }]} />
      <h1 className="text-3xl font-semibold tracking-tight">Suche</h1>
      <SearchForm size="large" defaultValue={defaultValue} id="suche-seite" />
      {children}
    </main>
  );
}
```

Import `type ReactNode` from `react` instead of using the global `React` namespace if lint requires it.

- [ ] **Step 7: Build without a database (SC-11 part 1)**

Run: `pnpm db:stop; pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0; the build output lists `/produkte/[category]` and `/produkte/[category]/[product]` as ISR/SSG-on-demand (●/○ with revalidate 1h) and `/`, `/produkte`, `/suche` as dynamic (ƒ). If `/` is prerendered or the build tries to reach `127.0.0.1:54321`, fix the segment config before continuing (consult `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`).

- [ ] **Step 8: Manual smoke check against the local stack**

Run: `pnpm db:start && pnpm db:reset`, then `pnpm dev` with `.env.local` pointing at the local stack, and open `/`, `/produkte/moebelteile`, `/produkte/moebelteile/testkeil-mit-daempfung`, `/suche?q=99010-1` (expect redirect to `#artikel-99010`), `/suche?q=Befestigung`. Fix visible defects.

- [ ] **Step 9: Commit**

```bash
git add app lib/catalog/load.ts lib/catalog/load.test.ts
git commit -m "feat(catalog): home, category, product and search pages with ISR"
```

---

### Task 8: E2E tests, accessibility scan and CI

**Files:**

- Modify: `package.json` (`@axe-core/playwright` dev dependency)
- Create: `e2e/catalog.spec.ts`, `e2e/search.spec.ts`, `e2e/a11y.spec.ts`
- Modify: `e2e/noindex.spec.ts` (page types)
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (Commands: how to run e2e locally)

**Interfaces:**

- Consumes: seeded local stack (`pnpm db:reset`), production build configured with the local stack's URL and publishable key.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add -D @axe-core/playwright`
Expected: added to `devDependencies`, lockfile updated.

- [ ] **Step 2: Write the e2e specs**

`e2e/catalog.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";

test.describe("public catalog", () => {
  test("home lists the categories (SC-2)", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Möbelteile \(Beispiel\)/ })
    ).toHaveAttribute("href", "/produkte/moebelteile");
    await expect(
      page.getByRole("link", { name: /Sanitärteile \(Beispiel\)/ })
    ).toHaveAttribute("href", "/produkte/sanitaer");
  });

  test("category page shows intro and published products only (SC-3)", async ({
    page,
  }) => {
    await page.goto("/produkte/moebelteile");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Möbelteile (Beispiel)"
    );
    await expect(
      page.getByText("Beispieltext für die Kategorie Möbelteile.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Testkeil mit Dämpfung/ })
    ).toHaveAttribute("href", PRODUCT);
    await expect(
      page.getByRole("link", { name: /Testabdeckung/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Entwurfsteil")).toHaveCount(0);
  });

  test("unknown category and product return 404 (SC-3, SC-4)", async ({
    request,
  }) => {
    expect((await request.get("/produkte/gibt-es-nicht")).status()).toBe(404);
    expect(
      (await request.get("/produkte/moebelteile/gibt-es-nicht")).status()
    ).toBe(404);
    expect(
      (await request.get("/produkte/moebelteile/entwurfsteil")).status()
    ).toBe(404);
  });

  test("product page shows every article and order number (SC-4, SC-5)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Testkeil mit Dämpfung"
    );
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 1");
    await expect(page.locator("#artikel-99011")).toBeVisible();
    for (const n of ["99010 - 1", "99010 - 2", "99011 - 1", "99011 - 2"]) {
      await expect(page.getByText(n, { exact: false }).first()).toBeVisible();
    }
  });

  test("colour picker switches the order numbers (SC-5)", async ({ page }) => {
    await page.goto(PRODUCT);
    await page.getByText("weiß", { exact: true }).first().click();
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 2");
  });

  test("product without colours shows no picker (SC-5)", async ({ page }) => {
    await page.goto("/produkte/moebelteile/testabdeckung");
    await expect(page.getByRole("group", { name: "Farbe" })).toHaveCount(0);
    await expect(page.locator("#artikel-99300")).toContainText("99300");
    await expect(page.getByText("Kein Bild").first()).toBeVisible();
  });

  test("accessory links to its home product (SC-6)", async ({ page }) => {
    await page.goto("/produkte/moebelteile/testabdeckung");
    await expect(page.getByRole("link", { name: /99011/ })).toHaveAttribute(
      "href",
      `${PRODUCT}#artikel-99011`
    );
  });

  test("seeded image renders with intrinsic size (SC-10)", async ({ page }) => {
    await page.goto(PRODUCT);
    const img = page.getByRole("img", {
      name: "Testkeil mit Dämpfung, Seitenansicht",
    });
    await expect(img).toHaveAttribute("width", "800");
    await expect(img).toHaveAttribute("height", "600");
  });

  test("every JSON-LD sku is visible on the page (SC-7)", async ({ page }) => {
    await page.goto(PRODUCT);
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const data = JSON.parse(json ?? "{}") as { hasVariant?: { sku: string }[] };
    const body = await page.locator("body").innerText();
    expect(data.hasVariant?.length).toBe(4);
    for (const v of data.hasVariant ?? []) expect(body).toContain(v.sku);
  });

  test("AI-generated description is labelled (SC-13)", async ({ page }) => {
    await page.goto("/produkte/sanitaer/testrohrschelle");
    await expect(page.getByText("KI-generiert")).toBeVisible();
  });

  test("product page is cached after the first request (SC-11)", async ({
    request,
  }) => {
    await request.get(PRODUCT);
    const second = await request.get(PRODUCT);
    expect(second.headers()["x-nextjs-cache"]).toBe("HIT");
  });

  for (const width of [360, 1280]) {
    test(`shell without horizontal scroll at ${width}px (SC-1)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PRODUCT);
      await expect(
        page.getByRole("region", { name: "Hinweis zur Vorschau" })
      ).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("all order numbers are in the HTML (SC-5)", async ({ page }) => {
    await page.goto(PRODUCT);
    const body = await page.locator("body").innerText();
    for (const n of ["99010 - 1", "99010 - 2", "99011 - 1", "99011 - 2"])
      expect(body).toContain(n);
  });
});
```

`e2e/search.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("search (SC-8)", () => {
  test("exact order number redirects to the article", async ({ page }) => {
    await page.goto("/suche?q=99010-1");
    await expect(page).toHaveURL(
      /\/produkte\/moebelteile\/testkeil-mit-daempfung#artikel-99010$/
    );
  });

  test("order number with a slash redirects to its anchor", async ({
    page,
  }) => {
    await page.goto(`/suche?q=${encodeURIComponent("99211/80 - 0")}`);
    await expect(page).toHaveURL(
      /\/produkte\/sanitaer\/testrohrschelle#artikel-99211-80$/
    );
  });

  test("a word shows a result list", async ({ page }) => {
    await page.goto("/suche?q=Befestigung");
    await expect(
      page.getByRole("link", { name: "Testrohrschelle" })
    ).toBeVisible();
  });

  test("no hits shows a message", async ({ page }) => {
    await page.goto("/suche?q=Gibtesnicht");
    await expect(
      page.getByText("Keine Treffer für „Gibtesnicht“.")
    ).toBeVisible();
  });

  test("too short query shows a hint without searching", async ({ page }) => {
    await page.goto("/suche?q=a");
    await expect(
      page.getByText("Bitte mindestens 2 Zeichen eingeben.")
    ).toBeVisible();
  });

  test("header search submits to /suche", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").first().fill("Befestigung");
    await page.getByRole("button", { name: "Suchen" }).first().click();
    await expect(page).toHaveURL(/\/suche\?q=Befestigung/);
  });
});
```

`e2e/a11y.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/produkte",
  "/produkte/moebelteile",
  "/produkte/moebelteile/testkeil-mit-daempfung",
  "/suche?q=Befestigung",
];

test.describe("accessibility (SC-15)", () => {
  for (const path of PAGES) {
    test(`no serious or critical axe violations on ${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
        );
      expect(blocking).toEqual([]);
    });
  }
});
```

In `e2e/noindex.spec.ts`, extend the meta-robots loop to all page types (SC-12):

```ts
for (const path of ["/", "/produkte", "/produkte/moebelteile", "/produkte/moebelteile/testkeil-mit-daempfung", "/suche?q=Befestigung", MISSING_PATH]) {
```

and add `"/produkte/moebelteile/testkeil-mit-daempfung"` to the `X-Robots-Tag` URL list.

- [ ] **Step 3: Run e2e locally against the seeded stack**

```bash
pnpm db:start && pnpm db:reset
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
export NEXT_PUBLIC_SUPABASE_URL="$(pnpm exec supabase status -o json | node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).API_URL))')"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(pnpm exec supabase status -o json | node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).PUBLISHABLE_KEY))')"
pnpm build && pnpm e2e
```

Expected: all specs PASS. If `x-nextjs-cache` is absent in standalone mode, read `node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md` ("Verifying"/"Debugging" sections) and assert on the header the docs name; do not weaken the test to "any value". Fix real axe findings in components (contrast, labels), never by disabling rules.

- [ ] **Step 4: CI — run e2e against a seeded stack (FR-16)**

In `.github/workflows/ci.yml`:

1. Remove from job `app` the steps from "Get Playwright version" through "Upload Playwright report" (the `app` job keeps lint, typegen, typecheck, test, build without a database — this is SC-11's build check — plus actionlint and the Docker build).
2. Add a job `e2e`:

```yaml
e2e:
  runs-on: ubuntu-latest
  timeout-minutes: 25
  env:
    NEXT_PUBLIC_SITE_URL: http://localhost:3000
  steps:
    - uses: actions/checkout@v7
    - uses: pnpm/action-setup@v6
    - uses: actions/setup-node@v7
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm db:start

    - name: Point the build at the local stack
      run: |
        status="$(pnpm exec supabase status -o json)"
        echo "NEXT_PUBLIC_SUPABASE_URL=$(jq -r .API_URL <<<"$status")" >> "$GITHUB_ENV"
        echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(jq -r .PUBLISHABLE_KEY <<<"$status")" >> "$GITHUB_ENV"

    - run: pnpm build

    - name: Get Playwright version
      id: playwright-version
      run: echo "version=$(pnpm exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"

    - name: Cache Playwright browsers
      id: playwright-cache
      uses: actions/cache@v6
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

    - name: Install Playwright browser
      if: steps.playwright-cache.outputs.cache-hit != 'true'
      run: pnpm exec playwright install --with-deps chromium

    - name: Install Playwright system dependencies
      if: steps.playwright-cache.outputs.cache-hit == 'true'
      run: pnpm exec playwright install-deps chromium

    - run: pnpm e2e

    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v7
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
```

3. `deploy.needs` becomes `[app, db, e2e]`.

Run locally: `docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color` → exit 0 (skip with a note in the report if Docker is unavailable).

- [ ] **Step 5: Document local e2e**

In `CLAUDE.md` → Commands, replace the E2E line with:
"- E2E: `pnpm e2e` — runs against the production build and the seeded local stack: `pnpm db:start && pnpm db:reset`, build with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `supabase status -o json`, then `pnpm e2e`"

- [ ] **Step 6: Full verification and commit**

Run (stack running, build pointed at it): `pnpm typecheck && pnpm lint && pnpm test && pnpm db:test && pnpm build && pnpm e2e` → all exit 0.

```bash
git add package.json pnpm-lock.yaml e2e .github/workflows/ci.yml CLAUDE.md
git commit -m "test(e2e): catalog, search and accessibility against the seeded stack"
```

---

## Spec coverage

| SC    | Task                                                           |
| ----- | -------------------------------------------------------------- |
| SC-1  | 5 (unit), 8 (e2e widths)                                       |
| SC-2  | 7, 8                                                           |
| SC-3  | 3 (int), 8                                                     |
| SC-4  | 4 (anchors), 6 (table), 8                                      |
| SC-5  | 4 (matrix), 6 (picker), 8 (JS on/off)                          |
| SC-6  | 3 (related), 8 (accessory)                                     |
| SC-7  | 4, 6, 8                                                        |
| SC-8  | 1 (pgTAP, unit, int), 4 (redirect target), 8                   |
| SC-9  | 2                                                              |
| SC-10 | 3 (URL), 6 (image/placeholder), 8                              |
| SC-11 | 5/7 (build without DB), 8 (cache header)                       |
| SC-12 | 4 (fallbacks), 8 (noindex on all page types)                   |
| SC-13 | 4, 6, 8                                                        |
| SC-14 | 7                                                              |
| SC-15 | 8                                                              |
| SC-16 | 8 (CI job), PR run after approval                              |
| SC-17 | Gate 2 / after merge and deploy (ops, needs production import) |

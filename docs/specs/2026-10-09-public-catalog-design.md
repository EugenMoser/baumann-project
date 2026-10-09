# Feature 4 — Public catalog

- **Status:** draft (2026-10-09)
- **Roadmap:** feature 4 ([roadmap](../roadmap.md))
- **Estimate:** 22 h
- **Builds on:** [data model](../data-model.md) (pages, visible content,
  structured data, search), feature 2 (read functions in `lib/catalog/`,
  `variant` view, search columns), feature 3 (real data via the importer)

## Goal

Turn the imported catalog into a public website that works as a reference:
a home page, one page per category with an intro text, one page per product
group that shows every article number, attribute, colour and order number in
the HTML, matching accessories and related products, `ProductGroup` JSON-LD,
and a search by name, article number and order number. Pages are cached
(ISR) and render without client JavaScript; the only client component is the
colour picker. The visual design is the project's own: calm, technical,
catalogue-like.

## Scope

In scope:

- Design foundation: tokens (colour, type, spacing) in `app/globals.css`,
  site header (text wordmark, link to the catalog, search field), footer,
  breadcrumb, responsive layout down to 360 px
- Home page `/`: short introduction, category tiles, search entry
- Category overview `/produkte` and category pages `/produkte/{category}`
  with intro text and product tiles (thumbnail, name, subtitle)
- Product pages `/produkte/{category}/{product}`: gallery, description,
  material, article table with typed attributes and packaging, colour picker,
  complete list of order numbers, accessories, related products, JSON-LD
- Search page `/suche?q=…` backed by a Postgres function
- Category intro and SEO texts delivered through the importer (D5)
- Images from Supabase Storage through `next/image`
- ISR for category and product pages; no database access during `next build`
- Metadata per page (title, description) with generated fallbacks
- AI label for fields whose origin is `ai` or `ai_edited`
- E2E tests against the seeded local stack in CI, including an accessibility
  scan

Out of scope:

- Inquiry button and form, imprint, privacy, about/quality (feature 5) — the
  product page links to the official contact page via the existing branding
  URL instead
- On-demand revalidation after admin changes (feature 6); until then pages
  refresh after at most one hour
- Live search suggestions, attribute and colour filters, comparison tables
  (later)
- Markdown rendering of descriptions (D8)
- Sitemap, canonical go-live setup, indexing (go-live)
- Dark mode (D9)
- Switching the repository to public — a separate step after this feature,
  with the developer's approval

## Decisions

### D1 — Classic ISR without Cache Components

Category and product routes export `revalidate = 3600` and a
`generateStaticParams` that returns an empty list. Nothing is prerendered at
build time; the first request renders the page, later requests are served
from the cache and refreshed in the background after an hour. Unknown slugs
return a real 404.

Cache Components (`cacheComponents`, `'use cache'`, App Shell) were
considered. They need every data read inside `<Suspense>` boundaries and
stream `notFound()` after the response has started, which makes 404 status
codes and tests harder for no visible gain at this size. Feature 6 can call
`revalidatePath` on the same routes. The bundled Next.js 16 docs
(`incremental-static-regeneration.md`) are the reference; the plan verifies
the exact segment config.

### D2 — No database access during the build

The CI `app` job and the Docker build have no reachable database. Therefore:

- `/produkte/[category]` and `/produkte/[category]/[product]`: ISR per D1
- `/`, `/produkte` and `/suche`: rendered per request (the home page and the
  overview read five categories; the search reads the query string). The
  plan picks the mechanism (`connection()` or segment config) and proves it
  with a build that runs without a database.

### D3 — Search as one Postgres function

`public.search_catalog(q text, max_results int default 50)`, `security
invoker`, `stable`, granted to `anon` and `authenticated`. RLS of the caller
applies, so only published products are found. It returns one row per
product:

| Column            | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `category_slug`   | for the link                                             |
| `product_slug`    | for the link                                             |
| `name`            |                                                          |
| `subtitle`        |                                                          |
| `matched_numbers` | order or article numbers that matched (array, may be []) |
| `match_kind`      | `exact_number` \| `number` \| `text`                     |
| `rank`            | sort key                                                 |

Matching, in order of rank:

1. `exact_number`: `q` equals an article number or an order number of the
   `variant` view, compared after collapsing whitespace (`6174-1`,
   `6174 - 1` and `6174 -1` are the same).
2. `number`: an article or order number starts with `q` (uses the trigram
   index on `article_number`).
3. `text`: `product.search @@ websearch_to_tsquery('german', q)` or an article
   name matches the same query; ranked with `ts_rank`.

The page layer validates `q` with Zod (trimmed, 2–100 characters). An empty
or too short query shows the search form with a hint and does not call the
database.

### D4 — Exact number hit redirects

If the search returns exactly one product and its `match_kind` is
`exact_number`, `/suche` redirects (307) to the product page with the article
anchor (`#artikel-{article_number}`, slash replaced by `-`). Every other case
shows the result list. Sales staff and customers type order numbers; this
gets them to the item in one step.

### D5 — Category texts come through the importer

The developer delivers the five intro texts (plain paragraphs, roughly 60–150
words each) and optional SEO title/description. They are stored in
`scripts/import/categories.mts` next to slug and name, and the importer
writes them **only when the stored value is empty** (`intro_text = ''`,
`seo_* is null`). This keeps edits from the admin (feature 6) and the
re-import semantics of feature 3 intact, and makes local runs and production
identical. A new migration replaces `import_catalog` with this rule.

A data migration was considered and rejected: it runs before the seed and
before the first import, so it would update nothing on a fresh database.

If the texts are not available when the plan reaches that task, the task
ships the mechanism with empty texts and the category page omits the intro
block; the Gate 2 report names the missing input.

### D6 — Colour picker as the only client component

The article table is server-rendered and shows, per article, the order number
for the selected colour (default colour without JavaScript). A small client
component (`ColorPicker`) renders the colour swatches as a radio group and
switches the displayed order numbers. Below the table a "Alle
Bestellnummern" list shows every variant as text, so every SKU in the JSON-LD
is visible on the page with or without JavaScript. Products without colours
show the bare article numbers and no picker.

### D7 — Images through `next/image` with optimisation

Images are loaded from the public `catalog` bucket via
`/storage/v1/object/public/catalog/…`. `next.config.ts` allows exactly this
path on the host from `NEXT_PUBLIC_SUPABASE_URL` (`images.remotePatterns`).
Width and height come from the `media` row, so there is no layout shift. The
standalone server optimises images with `sharp`; `minimumCacheTTL` is set to
one day to keep CPU load on the shared VPS low. A product without images
shows a neutral placeholder block with the product name, never a broken
image.

### D8 — Descriptions as plain paragraphs

`description` and `intro_text` are rendered as paragraphs (split on blank
lines, single line breaks kept). Imported data is plain text; a Markdown
renderer (and its dependency) waits until the AI assistant (feature 7)
actually produces Markdown.

### D9 — Light theme only

Product photos are shot on white; a dark theme would need image treatment.
The existing `prefers-color-scheme: dark` block in `globals.css` is removed.

### D10 — Related products

Up to four other published products of the same category, chosen by
`sort_order` distance to the current product (neighbours first, then
wrapping). Computed in the data layer from the category's product list; no
new table.

### D11 — Metadata fallbacks

- Title: `seo_title` ?? `name` (the root template adds the preview suffix).
- Description: `seo_description` ?? a sentence built from data, e.g.
  "{name} – {subtitle}. Artikel {first numbers …} in {n} Farben." for
  products and the first 155 characters of `intro_text` for categories.
- The root layout's `robots: noindex, nofollow` must never be overridden by a
  page; E2E checks it on every page type.

### D12 — Site shell without data

Header and footer live in the root layout so 404 and error pages get them
too. They read only `branding`, never the database: a data read in the root
layout would make every route depend on the database, including the 404 page
prerendered at build time (D2). Category navigation therefore lives on the
home page and `/produkte`, not in the header.

## Requirements and success criteria

SC types: **unit** (Vitest + Testing Library), **pgTAP** (`supabase test db`),
**int** (Vitest against the local stack), **e2e** (Playwright against the
production build and the seeded local stack), **review**.

Tests use the synthetic seed (`99xxx` numbers); the seed is extended where a
case is missing (accessory, product without colours, product without images,
AI-labelled description, article number with a slash). No customer data in
tests.

| ID    | Requirement                                                                                                                                                                                                                                       | Success criterion                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Site shell in the root layout (D12): header with text wordmark (`branding.shortName`), link to `/produkte`, search field (GET form to `/suche`); footer with link to the official site and the developer; demo banner unchanged above the header. | **SC-1** (unit): header renders the wordmark, a link to `/produkte` and a search form with `action="/suche"` and `name="q"`; (e2e): on 360 px and 1280 px the banner, header and footer are visible and the page has no horizontal scroll.                                                                                                                                          |
| FR-2  | Home page `/`: introduction, one tile per category (name, product count), search entry.                                                                                                                                                           | **SC-2** (e2e): `/` lists every seeded category with a link to `/produkte/{slug}`.                                                                                                                                                                                                                                                                                                  |
| FR-3  | `/produkte` lists all categories; `/produkte/{category}` shows breadcrumb, name, intro text (omitted when empty) and product tiles (thumbnail or placeholder, name, subtitle) in sort order.                                                      | **SC-3** (int): `getCategoryPage` returns a thumbnail per product when one exists and `null` otherwise; (e2e): a seeded category page shows its intro text and links to each published product; a draft product is not listed; an unknown category returns 404.                                                                                                                     |
| FR-4  | Product page: breadcrumb, H1, subtitle, gallery (thumbnail first), description (D8), material and material note, article table (number, name, typed attributes with unit, note, packaging), anchors `#artikel-{number}`.                          | **SC-4** (unit): article table renders attributes with units, notes and pack sizes and an anchor per article, slash in numbers mapped to `-`; (e2e): a seeded product page shows every article number of the group in the HTML; unknown product returns 404.                                                                                                                        |
| FR-5  | Colours: swatches with name, RAL reference and suffix; picker per D6; full order-number list.                                                                                                                                                     | **SC-5** (unit): with JS the picker switches the shown order numbers; without interaction the default colour is shown; (e2e): with JavaScript disabled every order number of the product's `variant` rows is in the page text; a product without colours shows no picker.                                                                                                           |
| FR-6  | Accessories (`product_accessory`) link to their home product; related products per D10.                                                                                                                                                           | **SC-6** (unit): related-product selection returns at most four, excludes the current product, prefers neighbours and wraps; (e2e): the seeded accessory links to its home product page.                                                                                                                                                                                            |
| FR-7  | JSON-LD `ProductGroup` per [data model](../data-model.md#structured-data): `productGroupID`, `name`, `description`, `image`, `variesBy` (colour if > 1 colour, size if > 1 article), `hasVariant` with `sku` = order number. No offers or prices. | **SC-7** (unit): builder output for a fixture matches the expected object; `<` in text is escaped in the serialised script; (e2e): every `sku` in the page's JSON-LD occurs in the visible page text.                                                                                                                                                                               |
| FR-8  | Search function and page per D3/D4.                                                                                                                                                                                                               | **SC-8** (pgTAP): exact order number (with differing whitespace), article-number prefix and a German word from a description each find the seeded product with the expected `match_kind`; a draft product is never returned to `anon`; (unit): query validation; (e2e): an exact order number redirects to the product anchor, a word shows a result list, no hits shows a message. |
| FR-9  | Category texts via importer per D5.                                                                                                                                                                                                               | **SC-9** (pgTAP): `import_catalog` fills empty `intro_text`/`seo_*` and keeps non-empty ones; (unit): the category table is valid against the payload schema.                                                                                                                                                                                                                       |
| FR-10 | Images per D7.                                                                                                                                                                                                                                    | **SC-10** (unit): URL builder returns the public object URL for a storage path and encodes special characters; (e2e): a seeded product image renders with width and height; a product without media shows the placeholder.                                                                                                                                                          |
| FR-11 | Caching per D1/D2.                                                                                                                                                                                                                                | **SC-11** (e2e/ops): `pnpm build` succeeds with the database stopped; a second request to a product page returns `x-nextjs-cache: HIT` (or the equivalent header verified in the plan).                                                                                                                                                                                             |
| FR-12 | Metadata per D11; `noindex` everywhere.                                                                                                                                                                                                           | **SC-12** (unit): fallback title/description builders; (e2e): home, category, product and search pages carry `<meta name="robots" content="noindex, nofollow">` and the `X-Robots-Tag` header.                                                                                                                                                                                      |
| FR-13 | AI label: a field with origin `ai` or `ai_edited` shows a visible label "KI-generiert" (or "KI-unterstützt, redaktionell bearbeitet").                                                                                                            | **SC-13** (unit): label shown for `ai` and `ai_edited`, hidden for `human`.                                                                                                                                                                                                                                                                                                         |
| FR-14 | Error handling: `not_found` → `notFound()`; `db_error` → logged server-side (no stack or SQL in the response) and rendered by `app/error.tsx`.                                                                                                    | **SC-14** (unit): page data loaders map `not_found` and `db_error` as specified.                                                                                                                                                                                                                                                                                                    |
| FR-15 | Accessibility: semantic landmarks, one H1 per page, table headers, colour never the only carrier of information, visible focus.                                                                                                                   | **SC-15** (e2e): an axe scan of home, category, product and search pages reports no serious or critical violations.                                                                                                                                                                                                                                                                 |
| FR-16 | CI runs the catalog E2E tests against a started and seeded local Supabase stack.                                                                                                                                                                  | **SC-16** (review): the CI workflow runs `pnpm e2e` with the stack running; the PR run is green.                                                                                                                                                                                                                                                                                    |
| FR-17 | Production check after deploy (needs the real import, feature 3 SC-15).                                                                                                                                                                           | **SC-17** (ops): on the preview a category page and a product page load with real data, images and the demo banner; evidence in the Gate 2 report.                                                                                                                                                                                                                                  |

## Structure

```
app/layout.tsx                              + header and footer (D12)
app/page.tsx                                home (FR-2)
app/produkte/page.tsx                       category overview
app/produkte/[category]/page.tsx            category page (ISR)
app/produkte/[category]/[product]/page.tsx  product page (ISR)
app/suche/page.tsx                          search page
components/site/*                           header, footer, breadcrumb, wordmark
components/catalog/*                        tiles, gallery, article table, colour
                                            picker (client), order-number list,
                                            accessories, related, AI label, JSON-LD
lib/catalog/search.ts                       searchCatalog(q) → Result
lib/catalog/related.ts                      pure related-product selection
lib/catalog/structured-data.ts              pure ProductGroup builder
lib/catalog/metadata.ts                     pure title/description fallbacks
lib/catalog/media.ts                        storage path → public URL
supabase/migrations/<ts>_search_catalog.sql
supabase/migrations/<ts>_import_category_texts.sql
supabase/tests/07_search.test.sql
e2e/catalog.spec.ts, e2e/search.spec.ts, e2e/a11y.spec.ts
```

Pure functions (search
query validation, related products, structured data, metadata, media URL)
are separated from rendering so they can be unit-tested.

## Data flow

```
request ─▶ page (server) ─▶ lib/catalog/* (anon client, RLS) ─▶ Postgres
                │                                        ▲
                │                                 search_catalog(q)
                ▼
     cached HTML (ISR, ≤ 1 h) ── ColorPicker hydrates (client, no data fetch)
     images: browser ─▶ /_next/image ─▶ Storage public URL
```

## New dependencies

| Package                | Kind | Why                               |
| ---------------------- | ---- | --------------------------------- |
| `@axe-core/playwright` | dev  | Accessibility scan in E2E (SC-15) |

`sharp` ships with Next.js as an optional dependency of the standalone build;
the plan confirms it is present in the Docker image.

## Error handling

- Read functions keep returning `Result`; pages map `not_found` to
  `notFound()` and throw a generic error for `db_error` after logging it
  (FR-14). A failed ISR refresh keeps serving the last good page.
- The search page treats a database error like other pages (error boundary);
  invalid input never reaches the database.
- Missing data reduces the display, never removes a block silently: no
  images → placeholder; no colours → bare numbers; no description → nothing;
  no related products → section omitted.

## Prerequisites from the developer

- Five category intro texts (and optional SEO title/description) for D5
- Production import (feature 3 SC-15) done before SC-17

## Risks

- **Image optimisation load on the shared VPS.** Mitigation: `minimumCacheTTL`,
  default device sizes; fallback is `unoptimized` for catalog images if the
  size check shows pressure.
- **ISR and the standalone build in Docker.** The cache lives in the
  container; a redeploy starts cold. Acceptable for a preview.
- **Search quality with German stemming** for technical terms (e.g.
  "Schließkeil"). The pgTAP cases pin the expected behaviour; tuning (synonyms,
  trigram on names) is a later improvement.
- **CI time** grows with an extra Supabase start for E2E; the plan may reuse
  the existing `db` job instead of starting a second stack.

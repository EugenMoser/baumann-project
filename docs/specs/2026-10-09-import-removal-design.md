# Feature 3 — Import & removal

- **Status:** draft (2026-10-09)
- **Roadmap:** feature 3 ([roadmap](../roadmap.md))
- **Estimate:** 12 h
- **Builds on:** [data model](../data-model.md) (import rules, removal),
  feature 2 (schema, RLS, storage bucket `catalog`, CI `db` job)

## Goal

Load the real catalog into Supabase — locally and on the preview — with one
repeatable command, and be able to remove it again just as reliably. The
importer turns the legacy data into the typed data model, reports everything it
could not map instead of guessing, and either writes a complete, cross-checked
catalog or nothing. After this feature, feature 4 renders real data.

## Scope

In scope:

- Importer CLI reading a local snapshot of the legacy database (JSON, outside
  the repo) and the legacy images (public image CDN URLs)
- Pure mapping layer: products, articles, attributes, materials, colours,
  packaging, accessories, media
- Import report (Markdown, written next to the snapshot, never into the repo)
- Postgres functions for an atomic import and an atomic removal, callable by
  the service role only
- Image upload to Storage with normalised paths and read dimensions
- Removal CLI (catalog rows + Storage objects) and placeholder branding
- `docs/import.md` (snapshot export, local and production runs) and
  `docs/revocation.md` (procedure ≤ 14 days)
- Production import run by the developer at the end of the feature

Out of scope:

- Category intro texts and SEO texts (written in feature 4); the importer
  leaves `intro_text` empty and never overwrites it
- Alt texts written per image (editorial review in feature 6, AI suggestions
  later); see D7
- Revalidation after import — no page reads catalog data yet (feature 4)
- Attribute filters, colour-family filters (later)
- Reading the legacy database directly (D1)

## Decisions

### D1 — Snapshot instead of a live connection

The current legacy data lives in the MongoDB of the old admin app. The importer
does not connect to it. The developer exports the four collections
(`products`, `articles`, `colors`, `product_colors_connection`) with
`mongoexport --jsonArray` into a directory outside the repo; the importer reads
that directory. Reasons: no legacy credentials or Mongo driver in this repo,
deterministic and offline-testable runs, and the same input can be replayed.
The snapshot shape follows the old app's current schema (image URLs as arrays,
packaging as strings, colour suffix as integer, extended-JSON wrappers for ids
and dates). Any deviation fails Zod validation with the offending path.

### D2 — Images from the public CDN

Image references in the snapshot are either absolute URLs or paths relative to
the old app's image CDN folder. Relative paths are resolved against
`IMPORT_IMAGE_BASE_URL` (env, not committed) with spaces replaced by `_`, as the
old app does. Originals are downloaded without transformation parameters. No
CDN API key is needed.

### D3 — Atomic write through one database function

The TypeScript side parses, validates, maps and uploads images, then calls
`public.import_catalog(payload jsonb)` once via RPC. The function runs in a
single transaction:

1. Upsert reference data by natural key: `category.slug`, `material.code`,
   `attribute.key`, `color` by (`name`, `hex_code`), `media.storage_path`.
2. Upsert products by `legacy_product_id` and articles by `article_number`.
3. Rewrite the children of every imported product/article
   (`article_attribute`, `article_packaging`, `product_color`,
   `product_media`, `product_accessory`, `category_attribute`).
4. Delete products that carry a `legacy_product_id` not present in the
   payload, and articles of imported products that are not in the payload.
   Rows without `legacy_product_id` (seed data, later admin entries) are never
   touched.
5. Run the cross-checks (FR-9); any failure raises and rolls everything back.
6. Return counts per table (inserted / updated / deleted).

Execute is granted to `service_role` only and revoked from `public`, `anon`
and `authenticated`. The function is `security invoker`; the service role
bypasses RLS. No SSH tunnel is needed for production — API URL and secret key
suffice.

### D4 — Re-import semantics

Same snapshot → same database state and same row ids (idempotent). On update
the importer overwrites every field it owns (names, texts, material, sort
order, attributes, colours, packaging, media links) but keeps fields it does not
own: `product.status`, `seo_*`, `*_origin`, `category.intro_text`,
`category.seo_*`, `media.alt_text` (set on insert only). New
products are inserted as `published`. After the admin exists (feature 6), a
re-import overwrites admin edits to imported fields — `docs/import.md` states
this.

### D5 — Never guess; report instead

Every value that does not match a known rule is kept verbatim (in `note`,
`description` or `material_note`) and listed in the report. The report is not a
failure; invalid or empty data is (FR-8).

### D6 — Deterministic choices for known legacy irregularities

- **Default colour:** suffix `0` when present, otherwise the lowest numeric
  suffix. Every product where the rule picked a non-`0` suffix is listed in the
  report (27 in the current data). Correction later in the admin.
- **Home product of shared articles:** an article number that appears in
  several products gets the product with the lowest `legacy_product_id` as its
  home; every further occurrence becomes a `product_accessory` row. Listed in
  the report.
- **Slugs:** from the product name (German transliteration `ä→ae`, `ß→ss`, …).
  On a collision within a category, name + subtitle; if that still collides,
  name + legacy id. Collisions are listed in the report (10 name collisions in
  the current data).
- **Article name** is stored only when it differs from the product name.
- **Colour names** `weiß (ähnlich RAL 9016)` split into `name` + `ral_reference`;
  `family` from the legacy colour-id prefix via a committed mapping table;
  exact duplicates (same name and hex) are merged and reported. Only colours
  used by at least one product are imported.

### D7 — Alt texts

The legacy data contains no alt texts. Each image gets the product name as
initial `alt_text` (`alt_origin = human`) so the column stays non-empty and
pages remain accessible; the report lists every image as "alt text needs
review". This deviates from import rule 8 ("take over alt texts") because there
is nothing to take over.

### D8 — Storage layout

`products/{category-slug}/{product-slug}/{normalised-file-name}`, where the
file name is the legacy base name lower-cased, transliterated, spaces and
underscores turned into `-`. Uploads use upsert, so re-runs are cheap. Objects
under `products/` that no `media` row references after a successful import are
deleted (after the commit, never before).

### D9 — Scripts run on Node's built-in type stripping

Like `scripts/smoke-check.mts`, the CLIs run with plain `node` (Node 22
type stripping): relative imports with `.ts` extensions, no TS-only runtime
syntax, no `@/` alias, no `tsx`. Mapping code is shared by the CLI and Vitest.

## Requirements and success criteria

SC types: **unit** (Vitest, synthetic fixtures), **pgTAP** (`supabase test db`),
**int** (Vitest against the local stack), **ops** (run by the developer,
evidence in the report), **review**.

All fixtures are synthetic (invented names, numbers `99xxx`) and imitate the
legacy irregularities; no customer data enters the repo.

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Success criterion                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | `pnpm catalog:import -- --snapshot <dir> [--dry-run]` validates env (`IMPORT_SUPABASE_URL`, `IMPORT_SUPABASE_SECRET_KEY`, `IMPORT_IMAGE_BASE_URL`) with Zod and refuses publishable/anon keys. `--dry-run` maps and writes the report but uploads and writes nothing.                                                                                                                                                                                                                                                                    | **SC-1** (unit): missing or invalid env and a publishable/anon key are rejected with a clear message; (int): a dry run against the local stack leaves all table counts and the bucket unchanged and writes a report.                                                                                                                                                      |
| FR-2  | Snapshot reader validates the four JSON files with Zod (D1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **SC-2** (unit): a valid fixture parses; a missing file, an empty array, a wrong type (e.g. `product_id` as string) and an unknown shape each fail with the file name and path in the message.                                                                                                                                                                            |
| FR-3  | Products: slug (D6), `legacy_product_id`, `description1` → `subtitle`, `description2..4` → `description` (joined by blank lines, empty parts dropped), `prio` → `sort_order`, category by legacy slug, material per FR-5.                                                                                                                                                                                                                                                                                                                | **SC-3** (unit): mapping of a fixture product; transliteration; both collision levels produce distinct slugs and report entries; a product with an unknown category fails.                                                                                                                                                                                                |
| FR-4  | Articles: `article_number` unchanged (incl. `/`), name per D6, shared articles per D6, packaging `vpe1..4` → `article_packaging` integers; a non-integer packaging value goes to `note` and the report. Attribute parsing per the rule table (Design). Full sentences (ending with `.`) → `description`; everything else unmatched → `note`. A rule that matches part of a value puts the remainder into `note`; both cases are reported.                                                                                                | **SC-4** (unit): each rule in the table maps a synthetic example to the expected key, decimal value (comma as decimal separator) and unit; a bare `Ø 12 mm` is not typed and is reported; a sentence lands in `description`; a partial match keeps the remainder; a shared article yields one home product and one accessory row.                                         |
| FR-5  | Materials: a known code alone, `CODE (qualifier)` or `CODE qualifier` → `material` + `material_note`; anything else (several materials, article references) → no material, full text in `material_note`, reported. Codes and names come from a committed table.                                                                                                                                                                                                                                                                          | **SC-5** (unit): `PA-6`, `PA-6 (temperaturbeständig bis 100° C)`, `PA-6 glasfaserverstärkt` map to code + note; a multi-part value falls back and is reported; an empty value yields no material.                                                                                                                                                                         |
| FR-6  | Colours per D6, `product_color` with the legacy suffix as text and exactly one `is_default` per product with colours.                                                                                                                                                                                                                                                                                                                                                                                                                    | **SC-6** (unit): name/RAL split; family from prefix; duplicate merge; default = suffix 0, else lowest suffix with a report entry; unused colours are dropped.                                                                                                                                                                                                             |
| FR-7  | Media: first small image → `thumbnail`, big images → `gallery` in order, further small images skipped and reported; download, dimensions via `image-size`, upload per D8; alt text per D7.                                                                                                                                                                                                                                                                                                                                               | **SC-7** (unit): URL resolution (absolute, relative, spaces); path normalisation; role assignment. (int): images served by a local test server end up in the bucket under the expected paths with correct width/height in `media`.                                                                                                                                        |
| FR-8  | The importer aborts with a non-zero exit code, after writing the report, on: invalid env, invalid or empty snapshot, zero products or articles, an article referencing an unknown product, a failed image download, an RPC error or a failed cross-check. It never prints success when nothing was written.                                                                                                                                                                                                                              | **SC-8** (int): each abort case (simulated) exits non-zero and leaves the database unchanged; a successful run prints the counts returned by the function.                                                                                                                                                                                                                |
| FR-9  | `import_catalog(jsonb)` per D3, incl. cross-checks inside the transaction: every payload article number exists exactly once; every imported product has ≥ 1 article; every imported product with colours has exactly one default; counts match the payload.                                                                                                                                                                                                                                                                              | **SC-9** (pgTAP): a valid payload imports; the same payload again changes no ids and no counts; a payload with a product without articles or two defaults raises and leaves the tables unchanged; rows without `legacy_product_id` survive; a product missing from a second payload is deleted with its children; `anon` and `authenticated` cannot execute the function. |
| FR-10 | Re-import semantics per D4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **SC-10** (int): import fixture → set a product to `archived` and a category `intro_text` → import again: status and intro text are kept, imported fields are restored, ids are unchanged, orphaned Storage objects are gone.                                                                                                                                             |
| FR-11 | Report (Markdown, `<snapshot>/import-report.md`, overwritten per run): summary counts, then one section per finding type (unparsed attribute values, material fallbacks, default colour by rule, merged colours, shared articles, slug collisions, skipped images, alt texts to review, packaging notes).                                                                                                                                                                                                                                | **SC-11** (unit): a fixture with one case of each finding type renders every section with article/product numbers; an empty section is omitted.                                                                                                                                                                                                                           |
| FR-12 | Removal: `pnpm catalog:remove -- --confirm <host of IMPORT_SUPABASE_URL>` calls `public.remove_catalog()` (service role only, one transaction, deletes all rows of every catalog table) and then deletes every object in bucket `catalog`. Without a matching `--confirm` it does nothing and exits non-zero.                                                                                                                                                                                                                            | **SC-12** (pgTAP): after `remove_catalog()` every catalog table is empty; `anon`/`authenticated` cannot execute it. (int): import fixture → removal without/with wrong `--confirm` changes nothing; with the right host the tables and the bucket are empty.                                                                                                              |
| FR-13 | `config/branding.ts` exports a `placeholderBranding` that passes the schema and contains no customer name or URL; switching to it is one line.                                                                                                                                                                                                                                                                                                                                                                                           | **SC-13** (unit): `placeholderBranding` parses and contains none of the customer strings in `branding`.                                                                                                                                                                                                                                                                   |
| FR-14 | `docs/import.md`: snapshot export commands (`mongoexport`, four collections, target outside the repo), env variables, dry run, local run, production run, re-import semantics (D4), where the report lands, deleting the snapshot afterwards. `docs/revocation.md`: steps and timeline ≤ 14 days — run removal on production, verify (counts 0, bucket empty, health ok), switch branding and deploy, delete local snapshots and reports, backups age out (7-day retention, runbook section 10) or are deleted, confirm to the customer. | **SC-14** (review): both documents exist, contain no internals (no hosts, keys, customer CDN name), and every command in them has been run once (local) with the output in the Gate 2 report.                                                                                                                                                                             |
| FR-15 | The real catalog is imported into production by the developer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **SC-15** (ops): dry run and real run against production; evidence: counts printed by the importer match the snapshot (126 products, 281 articles + 2 accessory links from 283 legacy article rows), report reviewed, `/api/health` ok, a published product readable with the publishable key.                                                                            |

## Design

### Structure

```
scripts/import/cli.mts            pnpm catalog:import: args, env, orchestration, exit codes
scripts/import/remove.mts         pnpm catalog:remove
scripts/import/env.ts             Zod env schema (shared by both CLIs)
scripts/import/snapshot.ts        read + validate the four JSON files
scripts/import/map/products.ts    products, slugs
scripts/import/map/articles.ts    articles, packaging, shared articles
scripts/import/map/attributes.ts  rule table + parser
scripts/import/map/materials.ts   material table + split
scripts/import/map/colors.ts      family table, split, merge, default
scripts/import/map/media.ts       URL resolution, roles, paths
scripts/import/categories.ts      the 5 categories (legacy slug, name, sort)
scripts/import/images.ts          download, dimensions, upload, orphan cleanup
scripts/import/report.ts          findings → Markdown
scripts/import/payload.ts         mapped data → jsonb payload type
supabase/migrations/<ts>_import_functions.sql   import_catalog, remove_catalog, grants
supabase/tests/06_import.test.sql
tests/import/*.test.ts            unit tests (part of `pnpm test`)
tests/integration/import.test.ts  against the local stack (part of `pnpm db:test`)
tests/fixtures/import/            synthetic snapshot + tiny images
docs/import.md, docs/revocation.md
```

Mapping functions are pure: input = validated snapshot, output = payload +
findings. Only `cli.mts`, `remove.mts` and `images.ts` do I/O.

### Attribute rule table (initial)

Rules match whole fragments; numbers use a comma or point as decimal separator.
The plan pins the exact regexes; new rules need a unit test.

| Pattern (example)                                    | Attribute key(s)                          | Unit |
| ---------------------------------------------------- | ----------------------------------------- | ---- |
| `Höhe 8 mm`, `Höhe: 8 mm`                            | `height`                                  | mm   |
| `Fußhöhe 30 mm`                                      | `foot_height`                             | mm   |
| `für 16 mm Plattenstärke`, `für 16 mm Platte`        | `panel_thickness`                         | mm   |
| `für Abwasserrohre Ø 40 mm Fußhöhe 30 mm`            | `pipe_diameter` + `foot_height`           | mm   |
| `für isolierte Abwasserrohre Ø 40 mm Fußhöhe 30 mm`  | `insulated_pipe_diameter` + `foot_height` | mm   |
| `für Heizungsrohre Ø 15 mm Fußhöhe 20 mm`            | `pipe_diameter` + `foot_height`           | mm   |
| `für Rundrohr Ø 25 mm`                               | `round_tube_diameter`                     | mm   |
| `für Schlauch Ø 10 mm R 5 mm`                        | `hose_diameter` + `radius`                | mm   |
| `für Kabel Ø 8 mm`                                   | `cable_diameter`                          | mm   |
| `für Leistenbreite 20 mm (mit Positionierung)`       | `strip_width` (+ remainder → `note`)      | mm   |
| `Tank-Bohrung 30 mm`, `Höhe 8 mm und Ø 5 mm Bohrung` | `bore_diameter` (+ `height`)              | mm   |
| `Einschubtiefe: 12 mm`                               | `insertion_depth`                         | mm   |
| `durch Stift Ø 6 mm`, `Zapfen Ø 8 x 10 mm`           | `pin_diameter` (length → `note`)          | mm   |

Not typed in this feature (reported, kept in `note`): bare `Ø N mm`, dimension
triples `N x N x N mm`, angles, `mit/ohne Positionierung` alone. The report
shows how many values were typed so the rule table can grow with evidence.

`category_attribute` is derived: every attribute used by an article of a
category is linked to that category, ordered by the attribute's `sort_order`.

### Data flow

```
snapshot/*.json ─▶ snapshot.ts (Zod) ─▶ map/* (pure) ─▶ payload + findings
                                                     │
                       report.ts ◀───────────────────┤ (always written)
                                                     ▼
              --dry-run? stop ── images.ts: download → size → upload (upsert)
                                                     ▼
                         rpc import_catalog(payload) — one transaction
                                                     ▼
                         images.ts: delete orphaned objects → print counts
```

### Local development

`pnpm db:reset` loads only the synthetic seed. The real import runs locally
with the keys from `pnpm exec supabase status`; the local DB then contains
customer data, which is fine (it never leaves the machine) — `pnpm db:reset`
removes it again.

## New dependencies

| Package      | Kind | Why                                                    |
| ------------ | ---- | ------------------------------------------------------ |
| `image-size` | dev  | Read width/height of WebP/PNG/JPEG without native code |

`mongoexport` (MongoDB Database Tools) is needed once on the developer's
machine for the snapshot; it is not a project dependency.

## Error handling

- Expected failures are values (`Result`), not exceptions, inside the mapping
  layer; the CLI turns them into one message and a non-zero exit code.
- The report is written before any abort that happens after parsing, so the
  developer sees what was found.
- Image uploads happen before the transaction; if the RPC fails, the uploaded
  objects stay (harmless, overwritten next run) and orphan cleanup is skipped.
- Removal deletes rows first (transaction), then Storage objects; if the
  Storage step fails, the CLI exits non-zero and a re-run finishes it.

## Prerequisites from the developer

- `mongoexport` installed; snapshot exported per `docs/import.md` into a
  directory outside the repo
- `IMPORT_IMAGE_BASE_URL` known (old app config)
- Production secret key available locally for the production run (FR-15);
  entered via prompt, never in shell history or files in the repo

## Risks

- The live legacy data may contain shapes the April 2025 backup does not
  (newer fields, empty strings instead of null). Zod fails loudly; the schema is
  adjusted with a fixture case.
- Some images may be missing on the CDN; the run aborts (FR-8) and the report
  names them. The fix is in the data, not a silent skip.
- RPC payload size (~300 KB) is well below PostgREST limits; if the production
  proxy limits request bodies, the runbook notes the setting.

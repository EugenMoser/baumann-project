# Feature 2 — Data layer & deploy

- **Status:** draft (2026-10-04)
- **Roadmap:** feature 2 ([roadmap](../roadmap.md))
- **Estimate:** 12 h
- **Builds on:** ADR 0001 (supabase-js + SQL migrations), ADR 0002 (Coolify
  deploy gated by CI), ADR 0003 (pgTAP), [data model](../data-model.md)

## Goal

Put the binding data model into Postgres with RLS as the only security
boundary, give the app a typed, tested read path to it, and ship every green
`main` build to the preview domain automatically, including database
migrations. After this feature, feature 3 (import) and feature 4 (public
catalog) can start without touching infrastructure.

## Scope

In scope:

- Env split: shared schema, client-safe public module, `server-only` server module
- Supabase CLI project (`supabase/`), local stack for dev and tests
- Migrations for data model v2: tables, enums, constraints, indexes, the
  `variant` view, search columns/indexes, `updated_at` triggers
- RLS on every table, admin check via JWT claim, storage bucket and policies
- Synthetic seed data (no customer data)
- pgTAP tests for schema, constraints and RLS; Vitest integration tests for the
  data access layer
- Generated database types with a drift check in CI
- Data access layer: Supabase client factory and the first read functions
- Health endpoint
- Dockerfile (`output: "standalone"`)
- CI: parallel DB job; deploy job on `main` (migrations via SSH tunnel, then
  Coolify webhook, then smoke check)
- Runbook `docs/deploy.md`: Supabase on Coolify, app resource, SSH deploy user,
  secrets, backups, updates, VPS size check

Out of scope (later features):

- Importer, removal script, real data (feature 3)
- Pages that render catalog data, search RPC, ISR wiring (feature 4)
- Auth UI, cookie-based sessions (`@supabase/ssr`), write functions,
  revalidation endpoint (feature 6)
- `ai_generation` writes and AI env variables (feature 7)
- Any mail sending; Supabase Auth runs with sign-ups disabled and without SMTP

## Decisions

### D1 — Admin check via `app_metadata.role`

The admin is a normal Supabase Auth user whose `raw_app_meta_data` contains
`"role": "admin"`. Only the service role can set `app_metadata`, so users cannot
grant it to themselves. A `stable` SQL function `private.is_admin()` reads
`auth.jwt() -> 'app_metadata' ->> 'role'`; all write policies use it. The
`private` schema is not exposed through the API. The admin account itself is
created in feature 6.

### D2 — Visibility follows the product

`category` and the reference tables (`attribute`, `category_attribute`,
`material`, `color`) are readable by everyone. Everything that hangs off a
product (articles, attributes, packaging, colours, media, accessories) is
visible to `anon` only if the owning product is `published`. Accessories
require both the host product and the accessory article's home product to be
published. `ai_generation` is admin-only.

### D3 — `variant` view with `security_invoker`

The view is created `with (security_invoker = true)`, so the caller's RLS
applies to the underlying tables. Without it the view would run as its owner
and leak unpublished variants.

### D4 — Defence in depth on grants

Besides RLS, `insert`/`update`/`delete` are revoked from `anon` on all public
tables. `authenticated` keeps them because the admin uses that role.

### D5 — API keys

Env names follow Supabase's new terminology:
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The schema accepts both the new
`sb_publishable_…` format and a legacy anon JWT, because self-hosted Supabase
may only issue the legacy key. The app needs no secret key in this feature;
the service-role/secret key is used only by scripts (feature 3).

### D6 — No runtime Zod parse of database rows

Rows are typed by generated types (`supabase gen types`). The schema is owned by
this repo, and CI fails when the committed types drift from the migrations.
A second runtime validation layer would duplicate the schema without catching
anything the drift check misses. Zod stays the rule for env, forms and
third-party APIs (AI in feature 7).

### D7 — Migrations reach production through CI only

After all checks are green on `main`, the deploy job opens an SSH tunnel to the
VPS with a restricted deploy key, runs `supabase db push --db-url` through it,
then triggers Coolify. Postgres is never reachable from the internet. Because
migrations go live before the new app version, migrations must be backwards
compatible with the running app (expand first, contract in a later release).

### D8 — Synthetic seed data

`supabase/seed.sql` contains invented products that cover the edge cases of
the real data (article number with a slash, product without suffix 0, draft
product, shared accessory, attribute of each data type). It is used only by the
local stack and CI and is never pushed to production.

## Requirements and success criteria

SC types: **pgTAP** (`supabase test db`), **int** (Vitest against the local
stack), **unit** (Vitest), **CI** (workflow run), **ops** (checked on the VPS,
evidence in the report), **review**.

| ID    | Requirement                                                                                                                                                                                                                                                                                                                       | Success criterion                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Env is split into `lib/env/schema.ts` (pure Zod schemas), `lib/env/public.ts` (client-safe values, explicit `process.env.NEXT_PUBLIC_*` reads) and `lib/env/server.ts` (`import "server-only"`). `next.config.ts` imports only the schema module and validates the full env there.                                                | **SC-1** (unit): missing or invalid `NEXT_PUBLIC_SUPABASE_URL` or publishable key throws; both key formats (D5) parse; existing `NEXT_PUBLIC_SITE_URL` cases stay green. (review): a throwaway client component importing `lib/env/server` makes `pnpm build` fail; output in the report, file not committed.          |
| FR-2  | `supabase/` contains the CLI config and migrations for every table, enum, constraint and index in the data model, plus `updated_at` triggers on `product`.                                                                                                                                                                        | **SC-2** (pgTAP): every table and column from the data model exists with the specified type; `supabase db reset` applies all migrations from scratch without error.                                                                                                                                                    |
| FR-3  | Constraints from the data model are enforced in the database.                                                                                                                                                                                                                                                                     | **SC-3** (pgTAP): duplicate `article_number` fails; duplicate product slug in the same category fails, in another category succeeds; a second `is_default` colour per product fails; `article_attribute` rejects `value_text` for a `decimal` attribute and vice versa; `article_packaging.quantity` ≤ 0 fails.        |
| FR-4  | The `variant` view returns one row per article × product colour with `order_number = article_number \|\| coalesce(' - ' \|\| suffix, '')`, and one row with the bare article number for products without colours.                                                                                                                 | **SC-4** (pgTAP): seed products yield the expected order numbers, incl. `6211/80 - 2` style and a null suffix.                                                                                                                                                                                                         |
| FR-5  | Search groundwork: a generated German `tsvector` column with a GIN index on `product`, and `pg_trgm` indexes on `article.article_number`.                                                                                                                                                                                         | **SC-5** (pgTAP): the indexes exist; a `websearch_to_tsquery('german', …)` query finds a seed product by a word from its description.                                                                                                                                                                                  |
| FR-6  | RLS is enabled on every table in `public`. Policies implement D1–D3; grants implement D4.                                                                                                                                                                                                                                         | **SC-6** (pgTAP): no table in `public` has RLS disabled; `anon` sees published rows only (products, articles, variants, media, colours, accessories) and no `ai_generation`; `anon` and a non-admin `authenticated` user cannot insert/update/delete any table; an admin can insert, update and delete in every table. |
| FR-7  | Storage bucket `catalog` exists (created by migration): public read; insert/update/delete for admins only.                                                                                                                                                                                                                        | **SC-7** (pgTAP): bucket is public; `anon` and non-admin inserts into `storage.objects` for the bucket fail; admin insert succeeds.                                                                                                                                                                                    |
| FR-8  | `supabase/seed.sql` provides synthetic data per D8.                                                                                                                                                                                                                                                                               | **SC-8** (review + pgTAP): seed contains no customer product names or numbers; SC-3–SC-7 run against it.                                                                                                                                                                                                               |
| FR-9  | Generated types live in `lib/supabase/database.types.ts`.                                                                                                                                                                                                                                                                         | **SC-9** (CI): the DB job regenerates the types from the local stack and fails on any diff.                                                                                                                                                                                                                            |
| FR-10 | Data access layer in `lib/catalog/`: a server-side client factory (`lib/supabase/server.ts`, publishable key, typed) and read functions `listCategories()`, `getCategoryPage(slug)`, `getProductPage(categorySlug, productSlug)`. They return a `Result` (data or typed error); "not found" is a distinct case, not an exception. | **SC-10** (int): against the seeded local stack, each function returns the expected shape; unpublished products and unknown slugs return `not_found`; a broken connection returns a typed error instead of throwing.                                                                                                   |
| FR-11 | `GET /api/health` returns `{ commit, db }` with status 200; `db` is `"ok"` or `"error"` based on a lightweight query. `commit` comes from the server env (`SOURCE_COMMIT`, set by Coolify).                                                                                                                                       | **SC-11** (unit): the handler maps a successful and a failing query to the right body; status is 200 in both cases.                                                                                                                                                                                                    |
| FR-12 | A multi-stage `Dockerfile` builds the app with `output: "standalone"`, runs as a non-root user and takes `NEXT_PUBLIC_*` values as build args.                                                                                                                                                                                    | **SC-12** (CI): the app job builds the image (`docker build`) with placeholder build args.                                                                                                                                                                                                                             |
| FR-13 | CI gets a parallel `db` job: start the local stack with unneeded services excluded, `supabase db reset`, `supabase test db`, type drift check, integration tests.                                                                                                                                                                 | **SC-13** (CI): the PR run shows both jobs green; a deliberately broken policy turns the `db` job red (evidence in the report, then reverted).                                                                                                                                                                         |
| FR-14 | A `deploy` job runs only on pushes to `main`, after `app` and `db` succeeded: SSH tunnel → `supabase db push` → Coolify webhook → smoke check that polls `/api/health` until `commit` equals the pushed SHA and `db` is `"ok"`, then checks `X-Robots-Tag` on `/`. Deploys are serialized.                                        | **SC-14** (CI, after merge): the first `main` run after the merge deploys and the smoke check passes. Before merge: `actionlint` passes and the job is skipped on PRs.                                                                                                                                                 |
| FR-15 | `docs/deploy.md` documents: Supabase service on Coolify (subdomain, sign-ups disabled, no SMTP, Studio protected), Postgres bound to `127.0.0.1` only, SSH deploy user with a key restricted to port forwarding, required GitHub secrets, app resource in Coolify, backups and restore test, update procedure, VPS size check.    | **SC-15** (review + ops): the developer runs the runbook; evidence: Postgres not reachable from outside (`nc` from the internet fails), deploy key cannot open a shell, `free -h`/`docker stats` recorded after the stack is up.                                                                                       |

## Design

### Structure

```
lib/env/schema.ts            Zod schemas (public + server), parseEnv()
lib/env/public.ts            client-safe env values
lib/env/server.ts            import "server-only"; server env values
lib/supabase/server.ts       createServerSupabase(): typed client, publishable key
lib/supabase/database.types.ts   generated, committed
lib/result.ts                Result<T, E> helper
lib/catalog/*.ts             read functions + their error types
app/api/health/route.ts      health endpoint
supabase/config.toml
supabase/migrations/*.sql    schema, RLS, storage, view, search
supabase/seed.sql            synthetic data
supabase/tests/*.sql         pgTAP tests
tests/integration/*.test.ts  Vitest against the local stack
vitest.integration.config.mts
Dockerfile, .dockerignore
.github/workflows/ci.yml     jobs: app, db, deploy
docs/deploy.md               runbook
```

`supabase` (CLI) and `server-only` are added as packages; scripts:
`db:start`, `db:reset`, `db:test` (pgTAP + integration), `db:types`.

### Migrations

One migration per concern, in this order: extensions and `private` schema →
enums → reference tables → product/article tables → relation tables → `variant`
view → search columns and indexes → RLS and grants → storage. Foreign keys get
indexes. `on delete` behaviour: deleting a product cascades to its articles,
colours, media links and accessory links; deleting an article referenced as an
accessory elsewhere cascades the accessory row; reference rows (`material`,
`color`, `attribute`) are `restrict`.

### Data access

- `createServerSupabase()` creates a supabase-js client with the publishable
  key and the generated `Database` type. No cookies yet; public reads run as
  `anon`, so RLS decides visibility.
- Read functions select exactly the columns the pages need and return
  `Result<T, CatalogError>` where `CatalogError` is `not_found` or
  `db_error` (with the PostgREST code kept for logging). They never throw for
  expected failures.
- Pages and ISR wiring come in feature 4; this feature proves the read path
  against the local stack.

### CI

```
app      (existing) lint → typegen → typecheck → unit → build → docker build → e2e
db       supabase start -x <unused> → db reset → test db → types diff → integration
deploy   needs: app, db · if: push to main · concurrency: deploy (no cancel)
         ssh tunnel → supabase db push → webhook → smoke check
```

The `app` job uses placeholder Supabase values; no page reads data yet, so E2E
needs no database. Secrets (repository secrets, not environments, because the
repo is private on the free plan): SSH host, user, private key, known-hosts
entry, production DB URL (pointing at the tunnel), Coolify webhook URL and
token, preview URL.

## New dependencies

| Package                 | Kind       | Why                                                   |
| ----------------------- | ---------- | ----------------------------------------------------- |
| `@supabase/supabase-js` | dependency | Data access (ADR 0001)                                |
| `server-only`           | dependency | Build error when server env is imported by the client |
| `supabase`              | dev        | Pinned CLI for migrations, tests, type generation     |

GitHub Actions: `supabase/setup-cli` is not needed (CLI comes from the package);
`actionlint` runs via its Docker image or binary in the PR check.

## Error handling

- Invalid env fails the build (unchanged principle from feature 1).
- Read functions return typed errors; feature 4 maps `not_found` to
  `notFound()` and `db_error` to the error boundary.
- Deploy job: any failing step (tunnel, push, webhook, smoke check) fails the
  run; a failed migration stops before the app is redeployed. The smoke check
  times out after 10 minutes.
- Health endpoint never throws; a DB failure shows up as `db: "error"`.

## Prerequisites from the developer

Done by the developer following `docs/deploy.md` (Claude has no VPS access):

- DNS: `baumann.eugen-moser.com` (app) and `api.baumann.eugen-moser.com`
  (Supabase API) point at the VPS
- Supabase service and app resource created in Coolify
- SSH deploy user with the restricted key
- GitHub repository secrets set

The deploy job can only be verified after merge (SC-14, SC-15); everything else
is verified on the feature branch.

## Risks

- Supabase and the app share a 2-vCPU VPS; the image is built there. The size
  check (FR-15) decides whether to switch to building in Actions (ADR 0002
  fallback).
- The Coolify Supabase template may expose Postgres differently from the
  upstream compose file (direct port vs. Supavisor); the runbook pins down which
  port the tunnel targets.
- Self-hosted Supabase may lag behind the hosted product (key format,
  defaults for exposing new tables); D5 and the explicit grants cover this.

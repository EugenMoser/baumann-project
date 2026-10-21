# baumann-demo

## What is this

Public reference project: rebuild of the product catalog of Baumann (injection-moulded
parts for the caravan industry) as a dynamic Next.js + Supabase app with an admin area
and an AI text assistant. Runs as a non-indexed preview at `baumann.eugen-moser.com`;
the customer's live website is not part of this repo.

## Status

Active. MVP: 6 of 10 features done (6 = admin, in two parts). Next: feature 4a (UI polish), then 4b (product images), then 7 (AI text assistant).
Roadmap: `docs/roadmap.md` · Data model: `docs/data-model.md`

## Tech stack

- Next.js 16.3 (App Router), React 19.2, TypeScript 5 (`strict: true`)
- Tailwind CSS 4 via `@tailwindcss/postcss`
- ESLint 9 flat config (`eslint.config.mjs`, `eslint-config-next`)
- Vitest + Testing Library (unit), Playwright (E2E), Prettier for formatting
- Zod for env and config validation
- pnpm 10

## Commands

- Dev server: `pnpm dev` — reads the preview database (the Supabase on the VPS; URL and publishable key in the maintainer's `.env.local`; the README's local setup is for outside contributors)
- Dev server against the local stack, without editing `.env.local` (shell variables take precedence over `.env` files in Next.js): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from pnpm exec supabase status -o json> pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- E2E: `pnpm e2e` — runs against the production build and the seeded local stack: `pnpm db:start && pnpm db:reset`, build with `NEXT_PUBLIC_SUPABASE_URL` = `API_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `ANON_KEY` (legacy JWT, as in CI and production) from `supabase status -o json`, then `pnpm e2e`
- Local Supabase: `pnpm db:start` / `pnpm db:stop` (Docker required) — synthetic seed, for tests (`db:reset`, `db:test`, `e2e`, CI), local import runs and restore tests; never kept with customer data longer than needed; tests never run against the preview database
- Reset local DB (migrations + seed): `pnpm db:reset`
- DB tests (pgTAP + integration, stack must run): `pnpm db:test`
- Regenerate DB types: `pnpm db:types`
- Import legacy catalog: `pnpm catalog:import --snapshot <dir> [--dry-run] [--overwrite-admin-edits]` — the preview is not re-imported; a real run against a non-local target needs the flag (see `docs/import.md`)
- Remove all customer data: `pnpm catalog:remove --confirm <api host>` (see `docs/revocation.md`)
- Create or reset an admin user: `printf '%s' "$PW" | pnpm admin:create --email <address>` (see `docs/deploy.md`)
- Remove orphan images: `pnpm media:prune [--apply]` (see `docs/deploy.md`)
- Handover snapshot of database and Storage: `scripts/ops/vps-backup.sh` — run by hand on the VPS, not locally (see `docs/deploy.md` section 10)
- E2E on another port (e.g. when 3000 is taken): `E2E_PORT=3100 pnpm e2e`
- Build: `pnpm build` (needs `NEXT_PUBLIC_SITE_URL`, see `.env.example`)
- Fresh clone: run `pnpm exec next typegen` (or `build`/`dev`) once before `pnpm typecheck`
- Pre-commit (Husky): gitleaks → lint-staged (ESLint + Prettier) → typecheck → test

## Structure & key files

- Routes and layouts live in `app/` (no `src/` dir); static assets in `public/`
- `docs/roadmap.md` — features, status, decisions, risks
- `supabase/` — migrations, seed, pgTAP tests
- `docs/deploy.md` — deploy runbook (VPS, Coolify, secrets, backups)
- `docs/data-model.md` — binding data model, import rules, RLS principles
- `docs/specs/`, `docs/plans/` — feature specs and implementation plans

## Project rules

- Specs go to `docs/specs/YYYY-MM-DD-<topic>-design.md`, plans to
  `docs/plans/YYYY-MM-DD-<feature>.md` — public, English, no internals. This
  deliberately overrides the private `.claude/specs|plans` convention.
- Specs use FR-/SC-IDs; verification checks test coverage per ID.
- TDD for every feature: the test-writer agent writes failing tests first.
- Feature 1 needs an explicit plan approval; later features follow the standard
  feature workflow.
- Never remove the demo notice or `noindex` (meta, `X-Robots-Tag`, `robots.txt`).
- Label AI-generated content and AI features in the UI.
- Never commit source exports, DB dumps or images; images live only in Supabase Storage.
- Service-role key and AI calls are server-side only; AI endpoints need a rate
  limit and cost cap.
- Never delete, move or rename anything in a `10_Business` folder — stop and ask.
- Agents and automated tests (e.g. ui-checker, Playwright, manual form tests by
  Claude) never submit admin forms against the preview database. Admin feature
  work and UI checks that write data run against the local stack (dev server
  command above).

## Pitfalls & open issues

- Default privileges on `public` are revoked for `anon`/`authenticated`: every new
  table needs explicit grants, RLS enabled and admin write policies in its
  migration (the RLS pgTAP test fails otherwise).
- Edits in the local admin (`pnpm dev`) change the preview database immediately;
  category and product pages on the preview refresh within 1 h (`revalidate = 3600`),
  since local `revalidatePath` does not reach the production app.
- `pnpm e2e` reuses a server already running on the E2E port (`reuseExistingServer`):
  with `pnpm dev` (preview database) on 3000 the suite would hit the preview database.
  Stop the dev server or set `E2E_PORT`. Likewise, `pnpm build` without the local
  overrides from the E2E command inlines the production Supabase URL from `.env.local`.

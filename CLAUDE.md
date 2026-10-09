# baumann-demo

## What is this

Public reference project: rebuild of the product catalog of Baumann (injection-moulded
parts for the caravan industry) as a dynamic Next.js + Supabase app with an admin area
and an AI text assistant. Runs as a non-indexed preview at `baumann.eugen-moser.com`;
the customer's live website is not part of this repo.

## Status

Active. MVP: 3 of 8 features done. Next: feature 4 (Public catalog).
Roadmap: `docs/roadmap.md` · Data model: `docs/data-model.md`

## Tech stack

- Next.js 16.3 (App Router), React 19.2, TypeScript 5 (`strict: true`)
- Tailwind CSS 4 via `@tailwindcss/postcss`
- ESLint 9 flat config (`eslint.config.mjs`, `eslint-config-next`)
- Vitest + Testing Library (unit), Playwright (E2E), Prettier for formatting
- Zod for env and config validation
- pnpm 10

## Commands

- Dev server: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- E2E: `pnpm e2e` — runs against the production build and the seeded local stack: `pnpm db:start && pnpm db:reset`, build with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `supabase status -o json`, then `pnpm e2e`
- Local Supabase: `pnpm db:start` / `pnpm db:stop` (Docker required)
- Reset local DB (migrations + seed): `pnpm db:reset`
- DB tests (pgTAP + integration, stack must run): `pnpm db:test`
- Regenerate DB types: `pnpm db:types`
- Import legacy catalog: `pnpm catalog:import --snapshot <dir> [--dry-run]` (see `docs/import.md`)
- Remove all customer data: `pnpm catalog:remove --confirm <api host>` (see `docs/revocation.md`)
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

## Pitfalls & open issues

- Default privileges on `public` are revoked for `anon`/`authenticated`: every new
  table needs explicit grants, RLS enabled and admin write policies in its
  migration (the RLS pgTAP test fails otherwise).

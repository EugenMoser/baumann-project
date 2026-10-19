# Baumann — product catalog (preview)

[![CI](https://github.com/EugenMoser/baumann-project/actions/workflows/ci.yml/badge.svg)](https://github.com/EugenMoser/baumann-project/actions/workflows/ci.yml)

> **Client project in development (preview).** This is not the official website
> of Tilo Baumann Spritzgussteile e.K. The preview is not indexed by search engines.

Rebuild of the product catalog of an injection-moulding manufacturer (parts for
the caravan industry, ~126 product groups / ~283 articles) as a dynamic
Next.js + Supabase web app with an admin area and an AI text assistant. It is a
public reference project, built with AI coding agents in a spec-first,
test-first workflow.

## Status

MVP: 6 of 8 features done. The public catalog, content pages, inquiry form and
the admin area are built and deployed. Next up are the AI text assistant
(feature 7) and the showcase with screenshots (feature 8). The preview is not
public yet; a link follows here.

Features, estimates and decisions: [docs/roadmap.md](docs/roadmap.md)

## Features

- Public catalog: category pages, product pages with variants, colours and
  derived order numbers, related products, `ProductGroup` JSON-LD, search by
  name and article number
- Quality page with certificates; inquiry form prefilled with the order number,
  which validates and then discards the request (preview only)
- Admin: e-mail/password login, CRUD for products, articles, categories,
  colours, materials and accessories, image upload with alt text; changes are
  live without a redeploy
- Importer for the legacy catalog with a report of unparsed values, and a
  removal script for all customer data
- Demo notice on every page; `noindex` via meta tag, `X-Robots-Tag` and
  `robots.txt`

## Stack

- Next.js 16 (App Router), React 19, TypeScript (`strict`), Tailwind CSS 4,
  shadcn/ui
- Self-hosted Supabase: PostgreSQL, Auth, Storage
- Zod for env, forms and external data
- Vitest + Testing Library, Playwright + axe, pgTAP
- GitHub Actions, Docker, Coolify on a VPS
- Vercel AI SDK + OpenRouter (feature 7)

## Architecture

- Server Components read through a typed data access layer on supabase-js, no
  ORM. Authorization lives in PostgreSQL: RLS on every table, storage policies
  and admin write policies; writes that span several tables run as SQL
  functions in a single transaction
  ([ADR 0001](docs/decisions/0001-data-access.md)).
- Public pages use ISR; every admin write revalidates them on demand.
- The admin is protected three times: `proxy.ts`, a server-side role check and
  RLS.
- CI runs lint, typecheck, unit tests, build, pgTAP and E2E on every pull
  request. A push to `main` applies migrations through an SSH tunnel, triggers
  the deploy and runs a smoke check
  ([ADR 0002](docs/decisions/0002-deploy.md),
  [ADR 0005](docs/decisions/0005-production-migrations.md)).

All decisions: [docs/decisions/](docs/decisions/)

## How it is built

Every feature runs through the same steps: roadmap → spec with FR/SC IDs →
plan → failing tests first → implementation by agents on a feature branch →
code and security review → pull request, merged by a human. Specs and plans are
public in [docs/specs/](docs/specs/) and [docs/plans/](docs/plans/); roles and
guardrails are described in [docs/ai-workflow.md](docs/ai-workflow.md).

The test suite has 97 Vitest files (unit, component, integration), 12
Playwright specs and 12 pgTAP suites. Pre-commit hooks run gitleaks, ESLint,
Prettier, typecheck and tests.

## Customer data

The repo contains no customer data. The seed is synthetic; the real catalog is
imported into the preview from exports kept outside the repo
([docs/import.md](docs/import.md)) and can be removed with one command
([docs/revocation.md](docs/revocation.md)).

## Local setup

Requires Node 22, pnpm 10 and Docker.

```bash
pnpm install
pnpm db:start && pnpm db:reset   # local Supabase with synthetic seed data
cp .env.example .env.local       # fill in before the next step, see below
pnpm exec next typegen
pnpm dev
```

`.env.local` needs `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, plus
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from
`API_URL` and `PUBLISHABLE_KEY` in `pnpm exec supabase status -o json`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test`, `pnpm e2e`.
All commands are listed in [CLAUDE.md](CLAUDE.md).

## License

No license is granted: the code is public as a reference, all rights
reserved. The customer's name, brand and catalog data belong to the customer
and are used with permission.

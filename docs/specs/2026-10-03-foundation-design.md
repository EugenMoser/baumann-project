# Feature 1 — Foundation

- **Status:** approved (2026-10-03)
- **Roadmap:** feature 1 ([roadmap](../roadmap.md))
- **Estimate:** 8 h
- **Plan approval:** required (only feature 1, see project rules in `CLAUDE.md`)

## Goal

Lay the groundwork every later feature builds on: a preview that can never be
mistaken for the customer's real website or indexed by search engines, a
validated configuration, the test stack, CI, and the recorded architecture
decisions for data access, deploy, tests and AI.

## Scope

In scope:

- Demo notice bar on every page
- `noindex` via meta tag, `X-Robots-Tag` header and `robots.txt`
- Branding config as single source for names and links
- Env schema with build-time validation and `.env.example`
- Test stack: Vitest + Testing Library (jsdom), Playwright (Chromium)
- CI on GitHub Actions
- Architecture decision records (ADRs) 0001–0004
- Skeleton of `docs/ai-workflow.md`
- Spike to pick the AI model (result recorded in ADR 0004)
- Removal of the create-next-app boilerplate; short `README.md`

Out of scope (later features):

- Supabase, migrations, pgTAP setup, deploy job and Coolify configuration (feature 2)
- Logo, visual redesign, design system (feature 4)
- AI SDK integration in the app (feature 7)
- Full README and screenshots (feature 8)

## Decisions

Each decision gets an ADR in `docs/decisions/` with context, decision,
alternatives and consequences.

### ADR 0001 — Data access via supabase-js, schema in PostgreSQL migrations

- The app reads and writes through `supabase-js` with the anon key and the
  user's JWT, so **Postgres RLS is the security boundary** for every request.
- Schema, constraints, RLS policies, views, functions and triggers are written
  by hand as PostgreSQL migrations managed by the Supabase CLI
  (`supabase/migrations/`). Types are generated from the schema
  (`supabase gen types`).
- Complex reads (the `variant` view, full-text search) are views or RPC
  functions in Postgres.
- Import and removal scripts use a direct Postgres driver with elevated rights;
  they run server-side only, never in the app.
- Rejected: Drizzle and Prisma — a direct DB connection bypasses RLS unless role
  and JWT claims are set per transaction, which creates a second security model.
  Learning goal: Postgres itself, not an ORM abstraction.

### ADR 0002 — Deploy via Coolify GitHub App, gated by CI

- The app is a Docker image built from a `Dockerfile` with Next.js
  `output: "standalone"`, deployed by Coolify on the existing VPS behind its
  Traefik proxy with TLS.
- Coolify is connected to the repo through its GitHub App; **Auto Deploy is
  off**. After CI passes on `main`, GitHub Actions calls Coolify's authenticated
  deploy webhook. Only green builds go live.
- Consequence: the image is built on the VPS (2 vCPU, shared with Supabase).
  If this becomes a bottleneck, switch to building in Actions and pushing to
  GHCR without changing the app.
- Implemented in feature 2.

### ADR 0003 — Test stack

- **Vitest + React Testing Library (jsdom)** for units and synchronous
  components. Async Server Components are not supported by Vitest and are
  covered by E2E tests.
- **Playwright (Chromium)** for E2E against the production build.
- **pgTAP** via `supabase test db` for schema and RLS tests (set up in feature 2).
- TDD: the test-writer agent writes failing tests first; specs use FR/SC IDs
  and verification maps every SC to a test or a documented review.

### ADR 0004 — AI via Vercel AI SDK and OpenRouter

- `ai` + `@openrouter/ai-sdk-provider`; model id via env.
- Start with a free (`:free`) model, fall back to a cheap paid model.
- Cost cap: hard limit on the OpenRouter API key (monthly reset) plus an
  app-side monthly counter.
- Free models may log prompts; only public catalog data is sent. Before any
  non-public data is processed, switch to a paid model with
  `data_collection: "deny"`.
- The model choice is the result of the spike below (FR-10).

## Requirements and success criteria

| ID    | Requirement                                                                                                                                                                                                                  | Success criterion                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | A demo notice bar is shown at the top of every page rendered inside the root layout, including 404 and segment error pages. It cannot be dismissed and links to the official website and to the developer.                   | **SC-1** (E2E): on `/` and on a non-existent path, at 1280 px and 360 px viewport width, the bar is visible, contains the preview text, both links have the configured `href`, and the page has no horizontal scroll. |
| FR-2  | Every HTML page carries `<meta name="robots" content="noindex, nofollow">`.                                                                                                                                                  | **SC-2** (E2E): present on `/` and on a 404 page.                                                                                                                                                                     |
| FR-3  | Every response carries `X-Robots-Tag: noindex, nofollow`.                                                                                                                                                                    | **SC-3** (E2E request): header present on `/`, `/robots.txt` and `/favicon.ico`.                                                                                                                                      |
| FR-4  | `robots.txt` disallows all crawlers.                                                                                                                                                                                         | **SC-4** (E2E): `/robots.txt` contains `User-Agent: *` and `Disallow: /`.                                                                                                                                             |
| FR-5  | Branding config (`config/branding.ts`) is the single source for company name, short name, official site URL, preview label and developer name/URL, validated with Zod.                                                       | **SC-5** (unit): the schema rejects an empty company name and an invalid URL; the demo bar component renders text and links from the config.                                                                          |
| FR-6  | Environment variables are validated with Zod (`lib/env.ts`, split server/public). `next.config.ts` imports the schema, so an invalid env fails the build with a readable message. `.env.example` contains placeholders only. | **SC-6** (unit): missing or invalid `NEXT_PUBLIC_SITE_URL` throws; a valid value parses.                                                                                                                              |
| FR-7  | CI runs on pull requests and on pushes to `main`: gitleaks, lint, typecheck, unit tests, build, E2E. Any failing step fails the run.                                                                                         | **SC-7** (CI run): a PR run is green; a deliberately failing test turns it red. Evidence in the Gate-2 report.                                                                                                        |
| FR-8  | ADRs 0001–0004 exist; `docs/ai-workflow.md` describes roles (human vs. AI), the flow roadmap → spec → plan → TDD → review → PR, and where artifacts live.                                                                    | **SC-8** (review).                                                                                                                                                                                                    |
| FR-9  | create-next-app boilerplate (sample page content, Vercel/Next SVGs) is removed; `README.md` is a short placeholder stating "Client project in development (preview)".                                                        | **SC-9** (check): no boilerplate assets in `public/`; README contains the notice.                                                                                                                                     |
| FR-10 | Spike: 2–3 free OpenRouter models are tried on 3 real products (German description + SEO title/description as structured output).                                                                                            | **SC-10** (review): ADR 0004 lists models, test cases, assessment (language quality, schema adherence, latency) and the chosen model with fallback.                                                                   |

## Design

### Structure

```
app/layout.tsx            root layout: <DemoBanner />, metadata incl. robots
app/page.tsx              placeholder home page
app/not-found.tsx         404 page (rendered inside the root layout)
app/robots.ts             disallow all
components/demo-banner.tsx
config/branding.ts        branding values + Zod schema
lib/env.ts                env schema (server/public)
next.config.ts            imports lib/env; headers(): X-Robots-Tag on '/:path*'
e2e/                      Playwright specs
vitest.config.mts, vitest.setup.ts, playwright.config.ts
.github/workflows/ci.yml
docs/decisions/0001-…0004-*.md
docs/ai-workflow.md
.env.example
README.md
```

### Demo notice bar

- Server Component in the root layout, rendered above the header on every route.
- Text (German UI): "Vorschau · Kundenprojekt in Entwicklung — nicht die
  offizielle Website." with links "Zur offiziellen Seite" and "Umsetzung:
  Eugen Moser". On narrow screens the text is shortened to one line; both links
  stay reachable.
- Not dismissible; landmark with an accessible label; sufficient contrast.
- All strings and URLs come from the branding config.

### Branding config

Values for the preview:

| Key               | Value                                   |
| ----------------- | --------------------------------------- |
| `companyName`     | Tilo Baumann Spritzgussteile e.K.       |
| `shortName`       | Baumann                                 |
| `officialSiteUrl` | `https://www.baumann-entwicklungen.de`  |
| `previewLabel`    | Kundenprojekt in Entwicklung (Vorschau) |
| `developer`       | Eugen Moser, `https://eugen-moser.com`  |

The object is parsed by its Zod schema at module load, so an invalid value fails
the build. Revocation (feature 3) replaces this file with placeholders.

### `noindex`

- `metadata.robots = { index: false, follow: false }` in the root layout.
- `headers()` in `next.config.ts` adds `X-Robots-Tag: noindex, nofollow` to
  `/:path*`, independent of page code — covers assets, API routes and error pages.
- `app/robots.ts` returns `Disallow: /` for all user agents. The domain has never
  been indexed, so blocking crawling does not hide the `noindex` from an
  existing index entry.

### Env

- `NEXT_PUBLIC_SITE_URL` (URL) is the only variable in feature 1.
- Supabase variables follow in feature 2, AI variables in feature 7; each
  extends the same schema and `.env.example`.

### CI (`.github/workflows/ci.yml`)

Triggers: `pull_request`, `push` to `main`. One job on `ubuntu-latest`, Node 22,
pnpm with cache:

1. gitleaks (full history on push, PR range on pull requests)
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. Playwright E2E against `pnpm start` (Chromium only, browsers cached)

The deploy step (Coolify webhook) is added in feature 2.

### AI model spike

- Throwaway script outside the app (not committed), using the OpenRouter API key
  from `.env.local` (provided by the developer; never committed).
- Input: 3 real products of different complexity (single article; several
  heights; several colours with pipe diameters).
- Output schema: `description` (Markdown, German), `seoTitle` (≤ 60 chars),
  `seoDescription` (≤ 155 chars).
- Result recorded in ADR 0004.

## New dependencies

| Package                                                                                                      | Kind       | Why                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------- |
| `zod`                                                                                                        | dependency | Branding and env validation, later all external data |
| `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event` | dev        | Component tests                                      |
| `jsdom`                                                                                                      | dev        | DOM environment for Vitest                           |
| `@vitejs/plugin-react`, `vite-tsconfig-paths`                                                                | dev        | Vitest setup per the Next.js guide                   |
| `@playwright/test`                                                                                           | dev        | E2E                                                  |

`vitest` is already installed.

## Error handling

- Invalid branding config or env → build fails; the preview is never served
  without notice or `noindex`.
- The `X-Robots-Tag` is set by configuration, not by page code, so it also
  applies to error responses.

## Prerequisites from the developer

- OpenRouter API key in `.env.local` for the spike (FR-10).
- GitHub repo `EugenMoser/baumann-project` (exists, private, empty) — remote is
  added and `main` pushed during implementation.

## Risks

- Free GitHub plan: no branch protection on private repos — until the repo goes
  public (after feature 4), PR discipline and CI status replace enforced rules.
- Free OpenRouter models may be unavailable during the spike — then the spike
  compares the cheapest paid models instead and records that.

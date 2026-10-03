# ADR 0003 — Test stack

- **Status:** accepted (2026-10-03)
- **Feature:** Feature 1 (Vitest, Playwright); pgTAP from feature 2

## Context

The project is developed test-first with AI agents. Tests need to cover pure
logic, components, full browser flows and database policies. Async Server
Components cannot be rendered by Vitest.

## Decision

- **Vitest + React Testing Library (jsdom)** for units and synchronous
  components. Async Server Components are covered by E2E tests.
- **Playwright (Chromium)** for E2E against the production build.
- **pgTAP** via `supabase test db` for schema and RLS tests, set up in
  feature 2.
- TDD: the test-writer agent writes failing tests first. Specs use FR/SC IDs,
  and verification maps every SC to a test or a documented review.
- Vitest resolves `tsconfig` path aliases with Vite's native
  `resolve.tsconfigPaths`, not the `vite-tsconfig-paths` plugin.

## Alternatives considered

- **RLS tests in Vitest:** rejected. The learning goal is Postgres, and tests
  written in SQL sit close to the policies they check.

## Consequences

- Positive: each layer is tested with a fitting tool; every success criterion
  traces to a test.
- Negative: three tools to maintain. E2E tests need a production build, so
  they are slower than unit tests.
- Next.js generates route types that `tsc` needs. On a fresh checkout,
  `next typegen` must run before the typecheck; CI does this.

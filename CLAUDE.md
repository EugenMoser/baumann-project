# baumann-demo

## What is this

_(TODO: purpose and audience)_

## Status

_(TODO: current focus and next step)_

## Tech stack

- Next.js 16.3 (App Router), React 19.2, TypeScript 5 (`strict: true`)
- Tailwind CSS 4 via `@tailwindcss/postcss`
- ESLint 9 flat config (`eslint.config.mjs`, `eslint-config-next`)
- Vitest for tests, Prettier for formatting
- pnpm 10

## Commands

- Dev server: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Build: `pnpm build`
- Pre-commit (Husky): gitleaks → lint-staged (ESLint + Prettier) → typecheck → test

## Structure & key files

- Routes and layouts live in `app/` (no `src/` dir); static assets in `public/`

## Project rules

_(none yet)_

## Pitfalls & open issues

_(none yet)_

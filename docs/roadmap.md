# Roadmap

> Client project in development (preview). Living document — features move
> from `open` → `in progress` → `done`. New ideas go to [Later](#later), not
> straight into code.

## Goal

Rebuild the product catalog website of an injection-moulding manufacturer
(parts for the caravan industry, ~126 product groups / ~283 articles) as a
dynamic web app with an admin area and an AI-assisted editing workflow.

The app runs as a **non-indexed preview** at `baumann.eugen-moser.com`. The
customer's current static website stays untouched and is not part of this
project.

## Audience

- **Primary:** prospective clients (SMEs) and employers evaluating the work —
  the repo and the preview are a public reference project.
- **Secondary:** the customer, who may adopt the app later.

## Success criteria for the MVP

- Public catalog with real product data, responsive, demo notice on every page,
  `noindex` everywhere.
- Admin can create, edit and delete catalog data including images; changes are
  live without a redeploy.
- One AI feature in the admin, clearly labelled as AI.
- Tests per requirement ID, CI green on every PR, agent reviews visible in PRs.
- `README.md` and `docs/ai-workflow.md` explain the project and the AI workflow.

## Out of scope (deliberately)

- Orders, checkout, payments, prices, customer accounts or stored customer data.
- Changes to or migration of the existing static website.
- Sending inquiries — the contact form validates and discards (see feature 5).
- Search-engine indexing, 301 redirects from old URLs, sitemap — only at go-live.
- Public admin access (no demo login); the admin is shown via screenshots/video.
- Editable content pages (home, about, quality) — content lives in the repo for now.

## Fixed decisions

| Topic      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4                                                                                                                                                                                                                                                                                                                                                                           |
| Backend    | Self-hosted Supabase (Postgres, Auth, Storage) on a VPS; app hosted on the same VPS                                                                                                                                                                                                                                                                                                                                                        |
| Validation | Zod for env, forms, external data                                                                                                                                                                                                                                                                                                                                                                                                          |
| Data model | [Data model](data-model.md) is binding: category entity, product group / article, domain-specific typed attributes per category, material lookup, accessories, colour as second variant axis with explicit `is_default`, `variant` view for order numbers, pack sizes, media with alt text and dimensions, publication status and AI origin per field, slugs `/produkte/{category}/{product}`, `ProductGroup` structured data. German only |
| Rendering  | ISR with on-demand revalidation after admin changes                                                                                                                                                                                                                                                                                                                                                                                        |
| Data       | Real customer data (consent given). Source exports and DB dumps never enter the repo; images live only in Supabase Storage                                                                                                                                                                                                                                                                                                                 |
| AI         | Vercel AI SDK + OpenRouter provider; free model first, cheap paid model as fallback, model id via env; hard key limit at OpenRouter + app-side monthly counter; switch to a paid model with `data_collection: deny` before any non-public data is processed                                                                                                                                                                                |
| Inquiry    | Form with shared Zod schema + Server Action that validates and discards (`NoopInquirySender`); visible demo notice; prefilled with the order number                                                                                                                                                                                                                                                                                        |
| Workflow   | Specs in `docs/specs/`, plans in `docs/plans/`; TDD via test-writer agent; feature branches + PRs with code and security review                                                                                                                                                                                                                                                                                                            |

To be decided in the feature 1 plan (with explicit plan approval): data access
via supabase-js vs. ORM (Prisma/Drizzle) and the consequences for RLS; deploy
path on the VPS (Docker, Coolify, …); test stack confirmation (Vitest + Testing
Library, Playwright, RLS tests against local Supabase).

## Features (MVP, in order)

Estimates in hours at ~10 h/week, ±30 %.

| #   | Feature                                                                                                                                                                                                                                                                                                                                                                                                                | Status      | Est. |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---- |
| 1   | **Foundation** — public GitHub repo, CI (lint, typecheck, test, build), test stack, env schema + `.env.example`, branding config, demo notice on every page, `noindex` (meta + `X-Robots-Tag` + `robots.txt`), `docs/ai-workflow.md` skeleton, AI model spike                                                                                                                                                          | in progress | 8 h  |
| 2   | **Data layer & deploy** — local Supabase for dev/tests, schema + migrations for data model v2, RLS on all tables, storage policies, RLS tests, data access layer, deploy pipeline to the preview domain                                                                                                                                                                                                                | open        | 12 h |
| 3   | **Import & removal** — idempotent importer from local CSV exports per the [import rules](data-model.md#import-rules): attribute parsing with a report of unparsed values, accessories, material split, colour clean-up with explicit `is_default`, pack sizes, images → Storage with normalised names and dimensions; aborts on empty or invalid data; cross-checks; removal script + `docs/revocation.md` (≤ 14 days) | open        | 12 h |
| 4   | **Public catalog** — redesign, home, category pages with intro text, product page (variants, colours, derived order number, visible article numbers, related products, `ProductGroup` JSON-LD), search by name and article number, ISR; afterwards the repo is switched from private to public (with approval)                                                                                                         | open        | 22 h |
| 5   | **Content pages & inquiry** — about/quality (certificates from Storage), imprint, privacy, contact/inquiry form (validate + discard, visible demo notice, link to the real contact page)                                                                                                                                                                                                                               | open        | 6 h  |
| 6   | **Admin** — Supabase Auth (single admin role), CRUD for categories, products, articles, colours, packaging; image upload with alt text; on-demand revalidation                                                                                                                                                                                                                                                         | open        | 22 h |
| 7   | **AI text assistant** — generate product description and SEO title/description from structured data as a suggestion; human reviews and accepts; AI-generated fields stay labelled; rate limit and cost cap                                                                                                                                                                                                             | open        | 10 h |
| 8   | **Showcase** — `README.md` (goal, demo link, stack, architecture, setup, preview notice), screenshots/video of the admin, `docs/ai-workflow.md` complete                                                                                                                                                                                                                                                               | open        | 4 h  |

**MVP total: ~96 h ≈ 10 weeks.** A first presentable intermediate state
exists after feature 4 (~54 h).

## Later

Unordered; each gets its own spec when picked up.

- Smart search in the public catalog (natural language → attribute filters)
- Alt-text suggestions via a vision model on upload
- Attribute filters and comparison tables on category pages, incl. filterable
  material properties (e.g. drinking-water approval) and colour families
- English translation (would require translation tables)
- Inquiry list (collect several items, one request)
- Editable content pages in the admin
- Go-live preparation: indexing, sitemap, 301 redirects via `legacy_product_id`

## Risks

| Risk                                                                                                            | Mitigation                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Self-hosted Supabase and the app share one VPS (RAM, updates, backups)                                          | Size check in feature 2; backups and update procedure documented                                  |
| Free AI models change, disappear or log prompts                                                                 | Model via env, paid fallback, only public catalog data is sent                                    |
| Legacy data quality (free-text dimensions, 27 products without a default colour suffix, file names with spaces) | Importer reports leftovers instead of guessing; aborts on empty/invalid data                      |
| Preview competes with the live site (duplicate content)                                                         | `noindex` via meta, header and `robots.txt`, covered by tests                                     |
| Visitors mistake the preview for the real site or send real inquiries                                           | Demo notice on every page, form discards with a visible notice and links to the real contact page |
| Next.js 16 differs from older conventions                                                                       | Read the bundled docs in `node_modules/next/dist/docs/` before writing code                       |
| Time budget of ~10 h/week                                                                                       | Small features, presentable intermediate state after feature 4                                    |

## Assumptions

- The customer's written consent for using name, branding and data exists.
- The repo lives on GitHub under the developer's account; private until feature 4, public afterwards.
- Supabase on the VPS is reachable under its own subdomain with TLS.
- The existing CSV exports are current enough for the preview.

# Feature 7 — AI text assistant

- **Status:** approved (2026-11-03), implemented (2026-11-03)
- **Roadmap:** feature 7 ([roadmap](../roadmap.md))
- **Estimate:** 12 h (roadmap 10 h, plus the request log in D7 and the two
  follow-ups in D11)
- **Builds on:** feature 6a (product editor, origin columns, `ai_generation`),
  feature 6c (SEO section with automatic placeholder),
  [ADR 0004](../decisions/0004-ai-provider.md) (AI provider)
- **Amends:** ADR 0004, model chain and data rule (D4)

## Goal

Writing a product description and the two search-engine texts is the slowest
part of maintaining a product. The assistant drafts all three from the
product's saved data. The editor reads each suggestion, accepts or discards
it, and saves. Nothing reaches the public site without an editor saving it,
and AI text stays labelled as AI text.

For the reference project, the feature shows an AI integration with a human
in the loop: labelled output, deterministic checks against invented facts,
bounded cost, and non-public data kept away from models that may log prompts.

## Background: what exists today

| Place                 | Today                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `product` columns     | `description_origin`, `seo_origin` (`human` \| `ai` \| `ai_edited`); `lib/admin/origin.ts` turns an edited `ai` field into `ai_edited`           |
| `ai_generation` table | `entity`, `entity_id`, `field`, `model`, `prompt_version`, `output`, `created_at`, `accepted_at`; RLS: admin only; cleared by `remove_catalog()` |
| Public product page   | `AiLabel` next to the description: "KI-generiert" / "KI-unterstützt, redaktionell bearbeitet"                                                    |
| Product editor        | Description textarea and SEO section are uncontrolled form fields; the SEO section shows the automatic value as placeholder (6c)                 |
| ADR 0004              | Chain: two free OpenRouter models, then `mistral-nemo` (paid). On 2026-11-01 both free models were no longer listed by OpenRouter                |
| Dependencies, env     | No AI package installed; no AI variables in the env schema                                                                                       |

## Scope

In scope:

- "Mit KI vorschlagen" in the editor of a saved product (D1, D5)
- Input from the saved product data (D2)
- Output checks against truncation and invented numbers (D3)
- Model chain: free OpenRouter models, Anthropic as fallback (D4)
- Suggestion boxes with "Übernehmen" / "Verwerfen" (D5)
- Origin on save, audit log, AI badges in the editor (D6)
- Rate limit and monthly cap with a request log (D7)
- Versioned German prompt (D8)
- Server env and a fake model for tests (D9)
- A small CLI to try the chain against real providers (D10)
- Follow-ups from 6c (D11)
- Docs: ADR 0004 amendment, data model, deploy, revocation, roadmap,
  CLAUDE.md status

Out of scope:

- Category intro texts and category SEO (roadmap "Later" if wanted)
- Alt-text suggestions (roadmap "Later")
- Generating texts for many products at once
- Streaming the answer into the field
- Editing the prompt in the admin
- AI on public pages; a visible label for SEO meta tags (they are not
  rendered on the page)
- Paid OpenRouter models

## Decisions

### D1 — Where the assistant lives

The product editor of a saved product shows a button "Mit KI vorschlagen"
above the description field. The create form has no button; its status hint
becomes "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten
Speichern."

Generation runs in a Route Handler (`POST`, JSON in and out), not a Server
Action: Next.js dispatches Server Actions one at a time per tab, so a
generation of up to a minute would hold back "Speichern" and every other
editor action (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`,
"Sequential dispatch on the client"). The handler checks the admin role like
`checkAdmin()`, accepts only `application/json` with an `Origin` equal to the
site URL (the CSRF protection Server Actions bring on their own), and never
changes `product`.

### D2 — Input

The server reads the product's **saved** state from the database, not the
form. Unsaved edits are not used; the hint under the button says so:
"Grundlage ist der zuletzt gespeicherte Stand."

Sent to the model, as a JSON block:

- category name, product name, subtitle
- material code and name, material note
- articles: number, name, description, note, material (the article's own,
  else the product's), material note, attributes (label, value, unit), pack
  sizes — the same article facts the public product page shows
- colours: names, which one is the default
- counts: number of articles, number of colours
- the current description, if not empty, as a fact source the model may
  rephrase

Not sent: images, internal ids, status, other products, admin user data.

### D3 — Output and checks

The model returns `description`, `seoTitle`, `seoDescription`. Every output
passes these checks before anyone sees it:

| Check   | Rule                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shape   | Zod schema; all three fields present and non-empty after trimming                                                                         |
| Length  | description 80–700 characters; `seoTitle` ≤ 60; `seoDescription` ≤ 155. A value exactly at a maximum is rejected (sign of a cut-off)      |
| Ending  | description and `seoDescription` end with `.`, `!` or `?`; `seoTitle` does not end with `-`, `,`, `:` or `–`                              |
| Form    | description is plain prose: no list items, headings, Markdown emphasis or links                                                           |
| Script  | only Latin letters (incl. umlauts and ß), digits, whitespace and common punctuation and symbols (`– „ “ ‚ ‘ × ° ± ⌀ / % ( )`)             |
| Numbers | every number in the output (incl. decimals such as `15,5`) occurs as a number in the input block; "8–15" fails when the input says `15,5` |

The prompt asks for shorter targets than the limits (about 55 and 140
characters). The number check is the guard against invented dimensions that
ADR 0004 found in the spike; it rejects rather than repairs.

### D4 — Model chain and data rule

1. **Free models** via OpenRouter, from `AI_FREE_MODELS` (comma-separated,
   in order, at most the first two are tried), **only for published
   products**. Free models may log prompts; published data is public anyway.
2. **Anthropic** via `ANTHROPIC_API_KEY`, model from `AI_FALLBACK_MODEL`
   (default `claude-haiku-5-5`, the user's choice), called through the
   official `@anthropic-ai/sdk` (the user's choice) with structured output
   and the same Zod schema. Used after the free models fail, and **directly
   for drafts and archived products**. Under Anthropic's commercial API terms, inputs are not used
   for training by default, so non-public product data may go there.

A failure is a timeout, an HTTP error, an empty answer or an output that
fails D3; the next tier follows. Time budget per tier, retries included:
25 s per free model (no SDK retry, a 429 moves on at once), 30 s for
Anthropic (one SDK retry on 429/5xx inside the 30 s). Worst case 80 s per
request. Each tier is called once.

The Anthropic effort is a fixed constant in code, set to `low`; the CLI
(D10) shows whether that passes D3, and raising it is a code change, not an
env value.

ADR 0004 gets an amendment: the original free models are gone after four
weeks, which confirms the risk; the chain is now configurable free models
plus Anthropic; the model of the paid tier changes from `mistral-nemo` to
Anthropic; the data rule above. The candidates for `AI_FREE_MODELS` are
chosen with the CLI from D10 and recorded in the amendment.

### D5 — Editor UI

- Button "Mit KI vorschlagen" with a visible "KI" marker and the hint from
  D2 plus "Vorschläge werden erst mit „Speichern“ übernommen."
- While running: button disabled, text "Vorschlag wird erstellt …", a polite
  live region announces start and result. Expected wait 5–60 s.
- Result: below each of the three fields a box "KI-Vorschlag" with the
  text, the model name in small type, and the buttons "Übernehmen" and
  "Verwerfen". The SEO section opens when it receives a suggestion.
- "Übernehmen" replaces the field content, removes the box and moves focus
  to the field. "Verwerfen" removes the box and moves focus to the next
  open box or back to the button.
- A new click replaces open boxes. Leaving the page drops them.
- The fields become controlled where needed; typing after "Übernehmen" is
  allowed and leads to `ai_edited` (D6).
- Next to "Beschreibung (Markdown)" and in the summary of "Suchmaschinen
  (optional)", a badge shows the saved origin with the public wording
  ("KI-generiert" / "KI-unterstützt, redaktionell bearbeitet"); nothing for
  `human`.

### D6 — Origin and audit

- Each successful request writes one `ai_generation` row per field
  (`entity = 'product'`, `field` = `description` | `seo_title` |
  `seo_description`, `model`, `prompt_version`, `output`, new
  `request_id`).
- "Übernehmen" puts the row id into a hidden field (`aiDescription`,
  `aiSeoTitle`, `aiSeoDescription`). On save the server loads each id and
  uses it only if the row belongs to this product and field, is not older
  than 24 h and is not yet accepted. If an id for a field saved non-empty
  fails any of these, the whole save is rejected, nothing is written, and the
  admin sees "Der KI-Vorschlag ist nicht mehr gültig; die betroffenen Felder
  wurden zurückgesetzt. Bitte neu generieren." (AI text is never silently
  saved as human). Ids for fields saved empty are ignored. The editor then
  resets every field that had an accepted id to its saved text and drops the
  ids (other fields keep their edits), so a second save cannot store the
  expired AI text unlabelled.
- Description origin: valid id → `ai` if the saved text equals the output
  (after the form's trimming), else `ai_edited`. No id → current rule.
- SEO origin (one column for two fields): with at least one valid SEO id,
  `ai` if every non-empty SEO field equals its accepted output, else
  `ai_edited`. No id → current rule.
- A field saved empty resets its origin to `human` (both SEO fields empty
  for `seo_origin`). This changes `nextOrigin`/`productOrigins`.
- Accepted rows get `accepted_at` in the same write as the product.

### D7 — Rate limit and monthly cap

New table `ai_request`: `id`, `product_id` (FK, `on delete set null`),
`requested_by` (uuid of the admin), `status` (`started` | `succeeded` |
`failed`), `model` (nullable), `input_tokens`, `output_tokens` (nullable),
`created_at`. `ai_generation` gets `request_id` (FK, nullable for old rows).
RLS: admin select/insert/update; explicit grants in the migration;
`remove_catalog()` also clears `ai_request`.

Before any provider call, one database function reserves a request: it
serialises callers (advisory lock), counts the requests of the current
calendar month (Europe/Berlin) and the caller's requests of the last hour,
and either inserts a `started` row or raises a distinct error per limit.
Parallel clicks cannot pass a limit together. Every reserved request counts,
whatever the outcome.

Limits from env: `AI_MONTHLY_REQUEST_CAP` (default 200),
`AI_HOURLY_REQUEST_LIMIT` per admin (default 20). Provider-side limits are
set by the operator and documented in `docs/deploy.md`: a spend limit for
the Anthropic key (own workspace), and an OpenRouter key with credit limit 0
(free models only).

### D8 — Prompt

A German system prompt, versioned in code (`prompt_version`
`product-copy-v1`), stored next to the generation module:

- audience: buyers and developers at caravan and motorhome manufacturers
- factual, neutral B2B tone; no "Sie"/"du" address, no superlatives, no
  prices, no claims about approvals or certificates unless in the data
- use only facts from the JSON block; leave out what is missing
- description: 2–4 sentences of plain prose, about 250–600 characters
- `seoTitle` about 55 characters, `seoDescription` about 140 characters,
  both complete sentences or phrases, no cut-offs

The JSON block is the only user content; product data is entered by admins
and treated as data, not instructions.

### D9 — Configuration and feature switch

Server-only env, validated with Zod in `lib/env`:

| Variable                  | Purpose                                              | Default            |
| ------------------------- | ---------------------------------------------------- | ------------------ |
| `OPENROUTER_API_KEY`      | free tier                                            | unset → tier off   |
| `AI_FREE_MODELS`          | comma-separated OpenRouter model ids                 | empty → tier off   |
| `ANTHROPIC_API_KEY`       | fallback tier                                        | unset → tier off   |
| `AI_FALLBACK_MODEL`       | Anthropic model id                                   | `claude-haiku-5-5` |
| `AI_MONTHLY_REQUEST_CAP`  | D7                                                   | 200                |
| `AI_HOURLY_REQUEST_LIMIT` | D7                                                   | 20                 |
| `AI_FAKE_MODEL`           | `1` = deterministic fake model for E2E and local use | off                |

`AI_FAKE_MODEL=1` is rejected by the schema unless `NEXT_PUBLIC_SITE_URL`
points to `localhost` or `127.0.0.1`, so it can never run on the preview.
With no usable tier the button is disabled with "Der KI-Assistent ist nicht
eingerichtet." With only the free tier, drafts get "Für Entwürfe ist kein
Modell eingerichtet." `.env.example` is maintained by the user; the plan
lists the lines to add. CI and E2E need no real keys.

### D10 — Trying the real chain

`pnpm ai:try --product <id> [--model <id>]` runs D2–D4 against the database
in `.env.local`-style env (local stack by default), prints the suggestions,
the model that answered, the latency and which check failed, and writes
nothing. It serves the model choice for D4 and a live check before Gate 2.
It refuses a non-local Supabase URL unless `--allow-remote` is given, like
`catalog:import`. Against a remote URL it reads with the publishable key,
so it only sees published products; the service-role key is used on the
local stack only.

The user decided that the autonomous run may use the CLI itself: with the
keys the user puts into `.env.local` before the run, the agent runs
`pnpm ai:try --allow-remote` read-only against published products of the
preview database (a few cents of Anthropic cost are approved), picks the
free models for `AI_FREE_MODELS` and writes the ADR 0004 amendment. The
draft path to Anthropic is tried on a seeded draft on the local stack. This
is a read-only model trial, not a test suite; tests stay on the local seed.
If the keys are missing, both steps are listed as open in the Gate 2 report.

Note (2026-11-03): the trial ran on the seeded local stack because the preview
database was unreachable that day. The run on three published preview products
is still pending.

### D11 — Follow-ups from 6c

- Unit tests for the slug retry on a concurrent clash through
  `saveProduct` and the category save (fake client: first call 23505 with
  the constraint name, second call ok; the second write uses the new slug).
- Remove the absolute local path from
  `docs/plans/2026-10-28-product-images-selection.md` (line 11).

## Requirements and success criteria

| ID    | Requirement                   | Success criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Assistant entry point per D1. | **SC-1** (unit): the editor of a saved product renders "Mit KI vorschlagen" with the D2/D5 hint; the create form renders no button and the new status hint; (unit): the handler rejects a non-admin session, a foreign `Origin` and a non-JSON body without calling a model; (e2e, fake model): "Speichern" works while a suggestion is pending.                                                                                                                                                                              |
| FR-2  | Input per D2.                 | **SC-2** (unit, fake client): the input block contains exactly the D2 fields of the saved product, incl. counts and the current description; it contains no ids, status, image paths or unsaved form values.                                                                                                                                                                                                                                                                                                                  |
| FR-3  | Output checks per D3.         | **SC-3** (unit): each D3 rule has a passing and a failing case; the ADR 0004 cases fail: `seoDescription` cut at 155 characters, "Sechs Höhen von 8–15" with input `15,5`, a bullet list in the description, a CJK character, a `seoTitle` ending mid-word at the maximum.                                                                                                                                                                                                                                                    |
| FR-4  | Model chain per D4.           | **SC-4** (unit, mock models): a published product tries the free models in order and stops at the first valid output; a 429, timeout, empty answer or D3 failure moves to the next tier; a draft or archived product never calls a free model; at most two free models are tried; with all tiers failing the result is an error and the request is marked `failed`.                                                                                                                                                           |
| FR-5  | Editor UI per D5.             | **SC-5** (unit): pending state and live-region texts; three boxes after a result; "Übernehmen" fills the field, removes the box and focuses the field; "Verwerfen" leaves the field unchanged and moves focus per D5; the SEO section opens on a suggestion; origin badges show the public wording; (e2e, fake model): click, accept description and SEO title, save → the public product page shows "KI-generiert" and the SEO title.                                                                                        |
| FR-6  | Origin and audit per D6.      | **SC-6** (unit): origin outcomes for accepted-unchanged, accepted-then-edited, mixed SEO fields, no id, a foreign or stale or reused id (save rejected, nothing written; also when only one of several ids fails), an expired id for a field saved empty (ignored), emptied fields (`human`); (integration, local stack): a save with an accepted id sets `accepted_at` and the origin in one write; (e2e): editing an accepted description before saving shows "KI-unterstützt, redaktionell bearbeitet" on the public page. |
| FR-7  | Limits per D7.                | **SC-7** (pgTAP): `ai_request` has RLS, grants and admin policies; anon reads nothing; the reserve function inserts a row below the limits and raises the monthly and hourly errors at the limits; `remove_catalog()` empties `ai_request`; (integration): two parallel reservations at limit − 1 yield one success and one limit error; (unit): each limit error maps to its German message.                                                                                                                                 |
| FR-8  | Prompt per D8.                | **SC-8** (unit): the system prompt contains the D8 rules and the version string; the version is written to `ai_generation.prompt_version`.                                                                                                                                                                                                                                                                                                                                                                                    |
| FR-9  | Configuration per D9.         | **SC-9** (unit): env schema accepts the D9 variables, applies the defaults, rejects `AI_FAKE_MODEL=1` with a non-local site URL; the button states for "not set up" and "free tier only" with a draft.                                                                                                                                                                                                                                                                                                                        |
| FR-10 | CLI per D10.                  | **SC-10** (unit): argument parsing, refusal of a remote URL without `--allow-remote`, publishable key for a remote URL, no writes; (live, agent per D10): runs on at least three published products of the preview database with each free-model candidate and with Anthropic, plus one seeded draft on the local stack, with model, latency and D3 result in the Gate 2 report; listed as open if the keys are missing.                                                                                                      |
| FR-11 | Follow-ups per D11.           | **SC-11** (unit): the two retry tests pass; (review): the 4b plan contains no absolute local path.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR-12 | Docs.                         | **SC-12** (review): ADR 0004 has the D4 amendment with the free models chosen per D10 (or a marked placeholder if the keys were missing); `docs/data-model.md` describes `ai_request` and `request_id`; `docs/deploy.md` lists the env variables and the provider-side limits; `docs/revocation.md` names the AI tables; roadmap row 7 shows the status; CLAUDE.md status is updated.                                                                                                                                         |

## Structure

```
lib/ai/product-copy/input.ts        facts block from the saved product (D2)
lib/ai/product-copy/checks.ts       D3 checks (pure)
lib/ai/product-copy/prompt.ts       system prompt, version (D8)
lib/ai/chain.ts                     tiers, timeouts, fallback (D4)
lib/ai/providers.ts                 OpenRouter, Anthropic, fake (D4, D9)
lib/ai/limits.ts                    reserve, finish, error mapping (D7)
lib/admin/origin.ts                 accepted ids, empty → human (D6)
lib/admin/products.ts               save with accepted ids (D6)
lib/env/schema.ts, server.ts        AI variables (D9)
app/admin/…/route.ts                Route Handler under the protected admin path (D1)
components/admin/ai-suggest.tsx     button, boxes, live region (D5)
components/admin/product-form.tsx   controlled fields, badges (D5)
components/admin/seo-section.tsx    suggestion boxes, badge (D5)
supabase/migrations/…_ai_requests.sql  table, column, function, RLS (D7)
supabase/tests/…                    SC-7
scripts/ai/try.mts                  CLI (D10)
e2e/admin/ai-assistant.spec.ts      SC-5, SC-6
docs/decisions/0004-ai-provider.md, docs/data-model.md, docs/deploy.md,
docs/revocation.md, docs/roadmap.md, CLAUDE.md
```

File names are a guide; the plan may merge or split modules.

## Data flow

1. Click → Route Handler → admin and origin check → load saved product (D2).
2. Reserve request (D7) → error message on a limit.
3. Chain (D4) → checks (D3) per tier → on success write three
   `ai_generation` rows and finish the request (`succeeded`, model, tokens);
   on failure finish it as `failed`.
4. Action returns the three suggestions with their row ids; nothing in
   `product` changes.
5. Accept → hidden id; save → D6 → `revalidatePath` as today.

## New dependencies

- `ai` (7.0.x): `generateText` with `Output.object` and Zod for the
  structured answer. ADR 0004.
- `@openrouter/ai-sdk-provider` (3.1.x): free tier. ADR 0004.
- `@anthropic-ai/sdk` (1.x): Anthropic tier, the user's choice over
  `@ai-sdk/anthropic` (first-party structured output, effort and typed
  errors).

Versions are pinned exactly, as with `@dnd-kit` in 6c; prefer a release
that is at least a week old (`@anthropic-ai/sdk` 1.4.0 appeared on
2026-11-02).

## Error handling

| Case                                   | Behaviour                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Not an admin                           | Same as other admin actions; no model call                                             |
| Product not found                      | "Produkt nicht gefunden."                                                              |
| Monthly cap reached                    | "Das monatliche Kontingent für KI-Vorschläge ist aufgebraucht."                        |
| Hourly limit reached                   | "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen."                           |
| No usable tier                         | Button disabled, "Der KI-Assistent ist nicht eingerichtet."                            |
| Draft, only free tier set up           | Button disabled, "Für Entwürfe ist kein Modell eingerichtet."                          |
| All tiers fail                         | "Es konnte kein brauchbarer Vorschlag erstellt werden. Bitte später erneut versuchen." |
| Database error while generating        | "Der Vorschlag konnte nicht erstellt werden. Bitte später erneut versuchen."           |
| Accepted id invalid on save            | Ignored, server log; origin as without id                                              |
| Product saved with errors after accept | Field values stay, hidden ids stay, boxes are gone                                     |

Provider error texts and keys never reach the client or the logs.

## Risks

- **Free models disappear or are rate-limited:** the chain falls through to
  Anthropic; model ids are env values.
- **Latency up to 80 s:** pending state and live region; the editor stays
  usable (Route Handler, D1). The reverse proxy on the VPS must allow
  responses of 90 s; `docs/deploy.md` names this as an operator check, and
  the first live click on the preview after deploy confirms it.
- **Invented facts in prose:** the number check catches invented numbers,
  not invented words; the editor reviews every suggestion and nothing is
  public without saving.
- **Cost:** capped three times (provider limit, monthly cap, hourly limit).
- **AI SDK 7 and Next.js 16 differ from older docs:** read the current docs
  (Context7, `node_modules/next/dist/docs/`) before writing code.

## Decisions log

Made by the user: free models first with Anthropic as fallback (instead of
the ADR 0004 chain); products only (no category texts); suggestion boxes
below the fields; Claude Haiku 5.5 as fallback model; the official
Anthropic SDK; the agent may run the read-only model trial per D10; the two
6c follow-ups belong to this feature.

Made while writing the spec and after its review, open to correction:
Route Handler instead of a Server Action (D1); article-level facts in the
input (D2); the number check (D3); the time budget per tier and the fixed
effort `low` (D4); the request log table and its limits (D7); empty field →
`human` (D6); the fake model guard (D9); the proxy timeout as an operator
check (Risks).

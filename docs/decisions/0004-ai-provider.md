# ADR 0004 — AI via Vercel AI SDK and OpenRouter

- **Status:** accepted (2026-10-03)
- **Feature:** Feature 1 (spike, FR-10); AI features later in the roadmap

## Context

The project uses an LLM for AI features on the catalog. Cost must stay
bounded, and a public demo should not depend on one paid provider. Free models
may log prompts, so the data they see matters.

## Decision

- Use the `ai` package (Vercel AI SDK) with `@openrouter/ai-sdk-provider`.
  The model id comes from an environment variable.
- Start with a free (`:free`) model, then a second free model, and fall back to
  a named cheap paid model (chain in "Model choice").
- Cost cap: a hard limit on the OpenRouter API key (monthly reset) plus an
  app-side monthly counter. The 2026-11-03 amendment supersedes this: the
  app-side monthly cap and hourly limit are the main caps, provider limits the
  backstop.
- Free models may log prompts, so only public catalog data is sent. Before any
  non-public data is processed, switch to a paid model with
  `data_collection: "deny"`.

## Model choice

Spike run on 2026-10-03 against the OpenRouter chat completions endpoint with
`response_format: json_schema` (strict) and a German system prompt for factual
B2B product copy. Output: `description`, `seoTitle` (max 60 characters),
`seoDescription` (max 155 characters).

**Candidates.** The public models endpoint listed five `:free` models with
`structured_outputs`. Three were tested; the other two were skipped as too
small or preview-only (`liquid/lfm-2.5-2.6b`, `dots-studio/dots-3-note-preview`).
For the paid fallback, the cheapest paid model listing `structured_outputs` was
added.

- `qwen/qwen3.8-27b:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- `apodex/apodex-1.1-mini:free`
- `mistralai/mistral-nemo` (paid, 0.019 USD input / 0.03 USD output per 1M
  tokens, 131k context)

**Test products** (public catalog data only): Anschlag für Schiebetüren (one
article), Schließkeile mit Dämpfung (several heights), Fachbodenträger (several
colours and pin diameters).

**Results** (language quality rated 1-5 by reading the output, one rater):

| Model                 | Schema adherence                            | Language | Invented facts / defects                            | Median latency |
| --------------------- | ------------------------------------------- | -------- | --------------------------------------------------- | -------------- |
| qwen3.8-27b           | 3 of 5 calls valid (2 were HTTP 429)        | 4        | no invented facts; one cut-off SEO text             | 13.8 s         |
| nemotron-3-super-120b | 2 of 4 calls valid (2 empty at 1500 tokens) | 4        | one mislabel; 832-character description             | 8.7 s          |
| apodex-1.1-mini       | 0 of 3 (HTTP 400, no `json_schema`)         | n/a      | n/a                                                 | n/a            |
| mistral-nemo (paid)   | 3 of 3 calls valid                          | 3        | cut-off SEO title and SEO text, stray CJK character | 6.5 s          |

Notes on the table:

- qwen: the `seoDescription` for the multi-height product was cut at exactly 155
  characters in the middle of a number ("Sechs Höhen von 8–15"). The real range
  is 8–15,5 mm. The output is schema-valid but wrong, so a length check cannot
  catch it.
- nemotron: with `max_tokens: 1500` two of three calls returned empty content
  with HTTP 200; one call with `max_tokens: 4000` succeeded. The script did not
  record `finish_reason`, so the cause is unconfirmed. The one call with
  `max_tokens: 4000` described "Höhe 15,5 mm breitere Ausführung" as "Breite 15,5 mm" and returned
  an 832-character description with a bullet list.
- apodex: supports `json_object` only, although the models endpoint lists
  `structured_outputs`.
- mistral-nemo: fastest and always schema-valid, but it fills the limit and cuts
  off: `seoTitle` ended mid-word at 60 characters ("Zap") and one
  `seoDescription` ended at 155 characters with a stray CJK character.

**Decision.** Three-tier chain:

1. Primary: `qwen/qwen3.8-27b:free`.
2. Secondary: `nvidia/nemotron-3-super-120b-a12b:free`. Use a larger
   `max_tokens` such as 4000; this is based on a single successful call and
   needs confirming.
3. Paid fallback: `mistralai/mistral-nemo`, used when both free models fail or
   are rate-limited. Cost is negligible at this price, and it was fast and
   schema-valid in 3 of 3 calls, but its German copy was the weakest, so its
   output needs the same checks below and possibly human review.

Qwen is primary because its three valid calls followed the schema without
invented facts, although only 3 of 5 calls succeeded. Nemotron is faster but
succeeded in 2 of 4 calls and made one factual slip. The evidence is small
(15 calls); the ranking is indicative.

**Guidance for the AI feature.**

- Validate every output with Zod and retry or move to the next tier on failure.
- Ask the model for shorter targets than the schema limits: about 140
  characters for `seoDescription` and about 55 for `seoTitle`.
- Reject outputs that do not end at a sentence or word boundary (or that
  contain non-Latin characters). The qwen case shows that a length check alone
  passes truncated text with wrong content.
- Cap `description` length in the prompt and in validation, and require plain
  prose without bullet lists.

**Limits observed.**

- Free models are rate-limited upstream: qwen returned HTTP 429 on 2 of 5 calls
  (provider-side, "temporarily rate-limited"). Without credits OpenRouter allows
  about 20 requests per minute and 50 per day (per OpenRouter docs, 2026-10).
- Latency of 6-18 s per call; generation must run asynchronously, not inline
  in a page render.
- Sample size is small (15 calls, 3 products); the ratings are indicative.
- A model listed with `structured_outputs` can still reject `json_schema`
  depending on the serving provider.

## Amendment 2026-11-03 — configurable free models, Anthropic fallback

Feature 7 (AI text assistant) changes the chain. The status stays accepted.

**What changed.** Four weeks after the spike, none of the three free models
was in the public models list any more. This confirms the risk named in
"Consequences". The model ids are therefore no longer fixed in this ADR:

1. Free tier: up to two OpenRouter `:free` models from the environment
   variable `AI_FREE_MODELS`, tried in order, 25 s each.
2. Paid tier: Anthropic `claude-haiku-5-5` through the official SDK
   (`AI_FALLBACK_MODEL`), 30 s, replacing `mistralai/mistral-nemo`.

A failure of a tier (HTTP error, timeout, empty answer or an output that
fails the checks of the spec) moves to the next tier. The ids carry no date
suffix.

**Data rule.** Free models may log prompts, so they only see published
products. Drafts and archived products go to Anthropic only; without an
Anthropic key the editor reports that no model is set up for drafts.

**Limits.** An app-side counter (`ai_request`, monthly cap 200 and hourly
limit 20 per admin by default, see `docs/data-model.md`) replaces the
OpenRouter monthly key limit as the main cap. Provider-side: a spend limit
on the Anthropic workspace and a credit limit of 0 on the OpenRouter key.

**Trial.** Run on 2026-11-03 with `pnpm ai:try` and real keys, on the seeded
local stack (synthetic data): the preview database was unreachable that day,
so the run on three published preview products is still pending. Candidates:
the four `:free` models of the OpenRouter models API that list
`structured_outputs`. Seed products 1-3 are published, seed product 4 is a
draft (Anthropic only). "ok" means a valid output; the other results name the
failure.

| Product           | xingchen-agi/xing4.0-29b-a4b:free | nvidia/nemotron-3.5-super-vl:free | dots-studio/dots-3-note-preview:free | liquid/lfm-2.5-2.6b:free | claude-haiku-5-5 |
| ----------------- | --------------------------------- | --------------------------------- | ------------------------------------ | ------------------------ | ---------------- |
| Seed 1, published | numbers check failed (7.5 s)      | timeout (25 s)                    | timeout (25 s)                       | error (0.2 s)            | ok (6.9 s)       |
| Seed 2, published | error (1.5 s)                     | timeout (25 s)                    | timeout (25 s)                       | ok (8.1 s)               | ok (6.9 s)       |
| Seed 3, published | ok (3.6 s)                        | timeout (25 s)                    | timeout (25 s)                       | error (0.4 s)            | ok (2.3 s)       |
| Seed 4, draft     | not allowed                       | not allowed                       | not allowed                          | not allowed              | ok (8.5 s)       |
| Valid outputs     | 1 of 3                            | 0 of 3                            | 0 of 3                               | 1 of 3                   | 4 of 4           |

**Choice.** Ordered by valid outputs, then latency of the valid answers:

`AI_FREE_MODELS=xingchen-agi/xing4.0-29b-a4b:free,liquid/lfm-2.5-2.6b:free`

Observations:

- The free models are unreliable (one valid output in three at best) and the
  valid answers are weaker than Haiku's. One answer has broken German
  ("Die Oberfläche ist mit glatt beschrieben."), and the valid lfm answer
  adds an unsupported claim about robust pipe connections. No check catches
  that, because the sentence contains no number. Haiku stayed with the data
  in all four runs.
- Leaving `AI_FREE_MODELS` empty (Anthropic only) is a valid operator choice:
  at 0.10 / 0.50 USD per million input / output tokens and the default cap of
  200 requests per month the cost stays in the cent range.
- Sample size is small (one run per cell, synthetic data); the free ranking
  is indicative and will go stale as models are withdrawn. Rerun
  `pnpm ai:try` before changing the list.
- `effort: "low"` with structured output is accepted by `claude-haiku-5-5`.

## Alternatives considered

- **Single paid provider SDK directly:** not chosen. OpenRouter allows
  switching models by changing an environment variable and offers free models
  for the demo.

## Consequences

- Positive: models are swappable without code changes; costs are capped twice.
- Negative: free models can be rate-limited or withdrawn, and may log prompts,
  which restricts them to public data.
- Follow-up: the model choice and fallback chain are recorded above.

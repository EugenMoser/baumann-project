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
  app-side monthly counter.
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
  record `finish_reason`, so the cause is unconfirmed. The successful call
  described "Höhe 15,5 mm breitere Ausführung" as "Breite 15,5 mm" and returned
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
(13 calls); the ranking is indicative.

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
  about 20 requests per minute and 50 per day.
- Latency of 6-18 s per call; generation must run asynchronously, not inline
  in a page render.
- Sample size is small (13 calls, 3 products); the ratings are indicative.
- A model listed with `structured_outputs` can still reject `json_schema`
  depending on the serving provider.

## Alternatives considered

- **Single paid provider SDK directly:** not chosen. OpenRouter allows
  switching models by changing an environment variable and offers free models
  for the demo.

## Consequences

- Positive: models are swappable without code changes; costs are capped twice.
- Negative: free models can be rate-limited or withdrawn, and may log prompts,
  which restricts them to public data.
- Follow-up: the model choice and fallback chain are recorded above.

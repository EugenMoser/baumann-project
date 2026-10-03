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
- Start with a free (`:free`) model and fall back to a cheap paid model.
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

- `qwen/qwen3.8-27b:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- `apodex/apodex-1.1-mini:free`

**Test products** (public catalog data only): Anschlag für Schiebetüren (one
article), Schließkeile mit Dämpfung (several heights), Fachbodenträger (several
colours and pin diameters).

**Results** (language quality rated 1-5 by reading the output, one rater):

| Model                 | Schema adherence                     | Language | Invented facts           | Median latency |
| --------------------- | ------------------------------------ | -------- | ------------------------ | -------------- |
| qwen3.8-27b           | 3 of 3 valid calls (2 more were 429) | 4        | no; one cut-off SEO text | 13.8 s         |
| nemotron-3-super-120b | 2 of 4 (2 empty at 1500 tokens)      | 4        | yes, one mislabel        | 8.7 s          |
| apodex-1.1-mini       | 0 of 3 (HTTP 400, no `json_schema`)  | n/a      | n/a                      | n/a            |

Notes on the table:

- qwen: the `seoDescription` for the multi-height product was cut off at 155
  characters in the middle of a phrase. Output is valid against the schema but
  needs a prompt hint or a truncation check in the app.
- nemotron: it is a reasoning model. With `max_tokens: 1500` two of three calls
  returned empty content with HTTP 200; with `max_tokens: 4000` the call
  succeeded. It described "Höhe 15,5 mm breitere Ausführung" as "Breite 15,5 mm".
- apodex: supports `json_object` only, although the models endpoint lists
  `structured_outputs`.

**Decision.** Primary: `qwen/qwen3.8-27b:free`. Fallback:
`nvidia/nemotron-3-super-120b-a12b:free` with `max_tokens` of at least 4000,
and a cheap paid model once free capacity is no longer enough (see Decision).
Qwen was chosen because every successful call followed the schema without
invented facts. Nemotron is faster but less reliable with a small token budget
and made one factual slip. Both need the app to validate output with Zod and
retry or fall back on failure.

**Limits observed.**

- Free models are rate-limited upstream: qwen returned HTTP 429 on 2 of 5 calls
  (provider-side, "temporarily rate-limited"). Without credits OpenRouter allows
  about 20 requests per minute and 50 per day.
- Latency of 6-18 s per call; generation must run asynchronously, not inline
  in a page render.
- Sample size is small (12 calls, 3 products); the ratings are indicative.
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
- Follow-up: the model choice is recorded here after the spike.

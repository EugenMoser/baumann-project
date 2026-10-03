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

Filled in by the spike (FR-10).

## Alternatives considered

- **Single paid provider SDK directly:** not chosen. OpenRouter allows
  switching models by changing an environment variable and offers free models
  for the demo.

## Consequences

- Positive: models are swappable without code changes; costs are capped twice.
- Negative: free models can be rate-limited or withdrawn, and may log prompts,
  which restricts them to public data.
- Follow-up: the model choice is recorded here after the spike.

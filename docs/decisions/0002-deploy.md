# ADR 0002 — Deploy via Coolify GitHub App, gated by CI

- **Status:** accepted (2026-10-03)
- **Feature:** Feature 2 (deploy); the CI workflow exists since feature 1

## Context

The app is deployed to a single existing VPS that also runs self-hosted
Supabase. Only builds that pass all checks should go live. The preview is
served at `baumann.eugen-moser.com`.

## Decision

- The app is a Docker image built from a `Dockerfile` with Next.js
  `output: "standalone"`.
- Coolify on the existing VPS deploys it behind its Traefik proxy with TLS.
- Coolify is connected to the repository through its GitHub App source.
  Auto Deploy is off.
- After the CI checks are green on `main`, GitHub Actions calls Coolify's
  authenticated deploy webhook. Only green builds go live.
- The CI workflow (GitHub Actions) exists already; the deploy webhook step is
  added in feature 2.

## Alternatives considered

- **Build in GitHub Actions and push to GHCR:** keeps builds off the VPS.
  Not chosen initially; kept as the fallback if VPS builds become a bottleneck.
  The app does not need to change for this switch.
- **Coolify Auto Deploy on push:** rejected, because it would deploy before CI
  has passed.

## Consequences

- Positive: simple setup, no separate registry, deploys gated by CI.
- Negative: the image is built on the VPS (2 vCPU, shared with Supabase), so
  builds compete with the running database.
- Follow-up: the webhook secret is stored as a GitHub Actions secret.

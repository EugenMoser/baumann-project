# ADR 0005 — Production migrations from CI through an SSH tunnel

- **Status:** accepted (2026-10-05)
- **Feature:** Feature 2 (data layer and deploy)

## Context

Schema changes must reach the self-hosted Supabase database on the VPS. The
database port must not be exposed to the internet, and the app container must
not hold credentials that can change the schema.

## Decision

- Migrations are applied only by CI: the `deploy` job runs
  `supabase db push` against the production database through an SSH tunnel.
- The tunnel uses a dedicated user and key restricted in `authorized_keys` to
  `restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin"`.
  Postgres listens on `127.0.0.1` of the VPS only.
- The migration step runs before the Coolify deploy webhook. If it fails, the
  app is not redeployed.
- Migrations follow expand/contract: each one works with the app version that
  is currently running; destructive changes ship in a later release.

## Alternatives considered

- **Manual `db push` from a developer machine:** simple, but the production
  schema drifts from what CI tested and nothing is auditable.
- **Public Postgres port with an IP allowlist:** GitHub-hosted runner IP ranges
  change and are large, so the allowlist would be either stale or too wide.
- **Migrations at container start:** the app would need database superuser
  credentials at runtime, and concurrent starts could race.

## Consequences

- Positive: one path for schema changes, auditable in CI logs, database never
  publicly reachable.
- Negative: an SSH private key lives in GitHub secrets; mitigated because it can
  only forward one port and has no shell.
- Negative: migrations run before the new app version switches in, so they must
  stay backward compatible (expand/contract).
- Follow-up: setup and verification steps are in `docs/deploy.md`.

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
- Before the webhook, the job checks that its commit is still the head of
  `main` (`git ls-remote`). Coolify deploys the branch head, so otherwise a
  newer app could go live before its own run has applied its migrations. A
  superseded run applies migrations only; the newer run deploys if its `app`
  and `db` jobs are green (if not, production stays on the previous version
  until a fix is pushed, harmless under expand/contract). Remaining window: if
  a push lands between the guard and Coolify's clone, the newer app runs
  against the older schema until its own run has applied its migrations, and
  this run's smoke check goes red. Expand/contract limits the impact; the next
  run fixes it forward.
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

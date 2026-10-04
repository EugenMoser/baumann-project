# ADR 0001 — Data access via supabase-js, schema in PostgreSQL migrations

- **Status:** accepted (2026-10-03)
- **Feature:** Feature 2 (schema, RLS, migrations); applies to all later features

## Context

The catalog rebuild runs on self-hosted Supabase. Every request from the app
must be authorized per user, and the security rules should live in one place.
The project also has an explicit learning goal: working with PostgreSQL itself
rather than an ORM abstraction.

## Decision

- The app reads and writes through `supabase-js` with the anon key and the
  user's JWT, so Postgres RLS is the security boundary for every request.
- Schema, constraints, RLS policies, views, functions and triggers are written
  by hand as PostgreSQL migrations managed by the Supabase CLI
  (`supabase/migrations/`).
- Types are generated from the schema (`supabase gen types`).
- Complex reads (the `variant` view, full-text search) are views or RPC
  functions in Postgres.
- Import and removal scripts use a direct Postgres driver with elevated rights.
  They run server-side only, never in the app.

## Alternatives considered

- **Drizzle:** a direct DB connection bypasses RLS unless role and JWT claims
  are set per transaction, which creates a second security model.
- **Prisma:** same problem as Drizzle.
- **Direct Postgres driver in the app:** same problem, and no generated types
  tied to the schema.

All three also work against the learning goal of using Postgres directly.

## Consequences

- Positive: one security model (RLS), enforced by the database for every
  request; types stay in sync with the schema.
- Negative: SQL skills are required for schema, policies and views.
- Follow-up: RLS policies are tested with pgTAP (see ADR 0003).

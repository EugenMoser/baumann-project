# Feature 2 — Data layer & deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The binding data model lives in Postgres with RLS as the only security boundary, the app has a typed and tested read path to it, and every green `main` build (including migrations) ships to the preview domain.

**Architecture:** Hand-written SQL migrations managed by the Supabase CLI define tables, the `variant` view, search indexes, RLS and the storage bucket; pgTAP tests pin schema, constraints and policies against synthetic seed data. The app reads through supabase-js with the publishable key (runs as `anon`, so RLS decides visibility) via small read functions that return a `Result`. A standalone Docker image is deployed by Coolify; a CI `deploy` job pushes migrations through an SSH tunnel first, then triggers Coolify and smoke-checks `/api/health`.

**Tech Stack:** Next.js 16.3.8, React 19.2, TypeScript strict, Zod 4, `@supabase/supabase-js` 2.117, Supabase CLI 2.119 (npm package `supabase`), PostgreSQL 17 + pgTAP, Vitest 5, Playwright 1.63, Docker, GitHub Actions, pnpm 10, Node 22.

**Spec:** [`docs/specs/2026-10-04-data-layer-deploy-design.md`](../specs/2026-10-04-data-layer-deploy-design.md) · Data model: [`docs/data-model.md`](../data-model.md)

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (route handlers, `output: "standalone"`, `server-only`).
- TypeScript `strict: true`; no `any`, no non-null assertions (`!`) — narrow explicitly.
- Code, identifiers, comments, commit messages, docs: English. UI copy: German.
- Conventional Commits; WIP commits on branch `feature/data-layer-deploy` are allowed. **No push, no PR, no merge to `main` (Gate 2).**
- Never commit secrets, `.env.local`, customer data exports, DB dumps or images. Seed data is invented (article numbers start with `99`), never customer data.
- Never remove or weaken the demo notice or any `noindex` mechanism.
- Package manager: pnpm (`pnpm add`, `pnpm exec`). Node 22.
- Supabase CLI always via `pnpm exec supabase …` (pinned package), never a global binary.
- Local stack is started with `pnpm db:start`; schema changes are applied with `pnpm exec supabase db reset` (local only, re-runs migrations and seed).
- SQL lives in files (`supabase/migrations`, `supabase/tests`, `supabase/seed.sql`) and is executed through the CLI. Do not pipe ad-hoc destructive SQL through `psql` heredocs. If a hook blocks a command, stop and report — never work around it.
- Exact env names: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SOURCE_COMMIT`.
- Storage bucket id: `catalog`. Admin check: `app_metadata.role = "admin"` in the JWT, via `private.is_admin()`.
- Preview domain `https://baumann.eugen-moser.com`, Supabase API `https://api.baumann.eugen-moser.com`. No IPs, internal hostnames or real secrets in any committed file.
- TDD: for every task, the **test-writer** agent writes the failing tests (step 1), the implementer makes them pass. Tests are never loosened to make them pass; report instead.
- `.env.example` may be unreadable through the Read tool (permission rule). Append to it with `printf '…' >> .env.example` in Bash; if that is blocked too, stop and report.

## Review Focus

1. **A secret key pasted into the public key variable** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_secret_…` or a `service_role` JWT) would be inlined into the browser bundle. The schema must reject both. Pinned in Task 1 (tests for `sb_secret_…` and a JWT with `"role":"service_role"`).
2. **`TRUNCATE` and the `variant` view bypassing RLS** — `TRUNCATE` ignores policies and a view without `security_invoker` runs as its owner. Expected: `anon`/`authenticated` hold no `TRUNCATE`, the view leaks nothing. Pinned in Task 4 (grant test + anon variant test).
3. **Accessory pointing at an unpublished article** — host product published, accessory article's home product draft. Expected: invisible to `anon`, so feature 4 cannot render a link to a hidden product. Pinned in Task 4 (seed row `(1, 5)`) and Task 5 (`getProductPage` returns no accessories for product 1).
4. **A push to `main` while a deploy is running** — the current workflow-level `cancel-in-progress: true` would kill the deploy job mid-migration. Expected: deploys run to completion and are serialized. Pinned in Task 8 (concurrency change + actionlint).
5. **Database slow or down during health checks** — a hanging query must not hang `/api/health` (Docker health check, smoke check). Expected: answer within ~3 s with `db: "error"`. Pinned in Task 6 (probe that never resolves → `error`).

---

## File Structure

| File                                                        | Responsibility                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `lib/env/schema.ts`                                         | Pure Zod schemas + `parsePublicEnv` / `parseServerEnv` (no `process.env`) |
| `lib/env/public.ts`                                         | `publicEnv`: explicit `process.env.NEXT_PUBLIC_*` reads                   |
| `lib/env/server.ts`                                         | `import "server-only"`; `serverEnv`                                       |
| `lib/env/schema.test.ts`                                    | SC-1                                                                      |
| `supabase/config.toml`                                      | CLI config (project id, sign-ups off, seed path)                          |
| `supabase/migrations/20261005090000_base.sql`               | Extensions, `private` schema, enums, helper functions                     |
| `supabase/migrations/20261005090100_catalog_tables.sql`     | Tables, constraints, FK indexes, triggers                                 |
| `supabase/migrations/20261005090200_variant_and_search.sql` | `variant` view, search column and indexes                                 |
| `supabase/migrations/20261005090300_rls_and_grants.sql`     | RLS, policies, grants                                                     |
| `supabase/migrations/20261005090400_storage.sql`            | `catalog` bucket and storage policies                                     |
| `supabase/seed.sql`                                         | Synthetic seed data                                                       |
| `supabase/tests/01_schema.test.sql` … `05_storage.test.sql` | pgTAP tests SC-2 … SC-7                                                   |
| `lib/supabase/database.types.ts`                            | Generated types (committed, not formatted)                                |
| `lib/supabase/server.ts`                                    | `createServerSupabase()`, `CatalogClient`                                 |
| `lib/result.ts`                                             | `Result`, `ok`, `err`                                                     |
| `lib/catalog/types.ts`                                      | View types + `CatalogError`                                               |
| `lib/catalog/errors.ts`                                     | `toDbError`, `guard`                                                      |
| `lib/catalog/categories.ts`                                 | `listCategories`, `getCategoryPage`                                       |
| `lib/catalog/product.ts`                                    | `getProductPage`                                                          |
| `tests/integration/*.test.ts`, `tests/integration/setup.ts` | SC-10 against the local stack                                             |
| `vitest.integration.config.mts`                             | Integration test config (reads keys from `supabase status`)               |
| `lib/health.ts`, `lib/health.test.ts`                       | `checkHealth`, `supabaseProbe` (SC-11)                                    |
| `app/api/health/route.ts`, `app/api/health/route.test.ts`   | Health endpoint                                                           |
| `Dockerfile`, `.dockerignore`                               | Standalone image (SC-12)                                                  |
| `scripts/smoke-check.mts`, `scripts/smoke-check.test.ts`    | Post-deploy smoke check                                                   |
| `.github/workflows/ci.yml`                                  | Jobs `app`, `db`, `deploy`                                                |
| `docs/deploy.md`                                            | Runbook (FR-15)                                                           |
| `docs/decisions/0005-production-migrations.md`              | ADR for D7                                                                |

---

## Preparation (orchestrator, before Task 1)

- [ ] Create the worktree with branch `feature/data-layer-deploy` from `main` (EnterWorktree / using-git-worktrees).
- [ ] Copy the uncommitted spec, plan and roadmap change from the main checkout into the worktree (`docs/specs/2026-10-04-data-layer-deploy-design.md`, `docs/plans/2026-10-04-data-layer-deploy.md`, `docs/roadmap.md`), then commit: `docs: add data layer and deploy spec and plan`.
- [ ] Copy `.env.local` from the main checkout if it exists (untracked, needed for `pnpm dev` only).
- [ ] `pnpm install` and `pnpm exec next typegen`.

---

### Task 1: Split env into schema, public and server modules (FR-1)

**Files:**

- Create: `lib/env/schema.ts`, `lib/env/public.ts`, `lib/env/server.ts`, `lib/env/schema.test.ts`
- Delete: `lib/env.ts`, `lib/env.test.ts` (use `git mv lib/env.test.ts lib/env/schema.test.ts` then rewrite)
- Modify: `app/layout.tsx:5,20`, `next.config.ts`, `vitest.config.mts`, `vitest.setup.ts`, `.github/workflows/ci.yml:19-21`, `.env.example`, `package.json` (dependency `server-only`)

**Interfaces:**

- Produces: `parsePublicEnv(source: Record<string, string | undefined>): PublicEnv`, `parseServerEnv(source): ServerEnv`, `publicEnv: PublicEnv` (from `@/lib/env/public`), `serverEnv: ServerEnv` (from `@/lib/env/server`), types `PublicEnv`, `ServerEnv`.

- [ ] **Step 1 (test-writer): Write the failing test** — `lib/env/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./schema";

// Builds a JWT-shaped string with the given payload (signature is irrelevant).
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const valid = {
  NEXT_PUBLIC_SITE_URL: "https://baumann.eugen-moser.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.baumann.eugen-moser.com",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123_XYZ-9",
};

describe("parsePublicEnv (FR-1, SC-1)", () => {
  it("parses a complete valid environment", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("accepts http for local development", () => {
    const env = parsePublicEnv({
      ...valid,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it.each(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"])(
    "throws a readable error when %s is missing, empty, not a URL or not http(s)",
    (name) => {
      for (const value of [undefined, "", "not-a-url", "ftp://example.com"]) {
        expect(() => parsePublicEnv({ ...valid, [name]: value })).toThrow(
          new RegExp(`Invalid environment variables[\\s\\S]*${name}`)
        );
      }
    }
  );

  it("accepts a legacy anon JWT as publishable key", () => {
    const key = fakeJwt({ role: "anon", iss: "supabase" });
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ).toBe(key);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["a secret key", "sb_secret_abc123"],
    ["a service_role JWT", fakeJwt({ role: "service_role" })],
    ["a JWT without role", fakeJwt({ iss: "supabase" })],
    ["a malformed JWT", "eyJhbGciOiJIUzI1NiJ9.not-base64!.sig"],
    ["random text", "hello"],
  ])("rejects a publishable key that is %s", (_label, value) => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("parseServerEnv (FR-1)", () => {
  it("treats SOURCE_COMMIT as optional", () => {
    expect(parseServerEnv({})).toEqual({});
  });

  it("keeps a provided SOURCE_COMMIT", () => {
    expect(parseServerEnv({ SOURCE_COMMIT: "abc123" }).SOURCE_COMMIT).toBe(
      "abc123"
    );
  });

  it("treats an empty SOURCE_COMMIT as missing", () => {
    expect(parseServerEnv({ SOURCE_COMMIT: "" }).SOURCE_COMMIT).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/env/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implement** — `pnpm add server-only`, then:

`lib/env/schema.ts`:

```ts
import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

// Reads the `role` claim of a JWT without verifying it. Only used to make sure
// a legacy key in a public variable is the low-privilege anon key.
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[\w-]+$/.test(parts[1])) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (typeof payload !== "object" || payload === null) return null;
    const role = (payload as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

// New format (`sb_publishable_…`) or a legacy anon JWT (self-hosted Supabase).
// Secret keys must never end up in a NEXT_PUBLIC_ variable.
const publishableKey = z
  .string()
  .refine(
    (key) => /^sb_publishable_[\w-]+$/.test(key) || jwtRole(key) === "anon",
    "must be a publishable key (sb_publishable_…) or a legacy anon JWT"
  );

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
});

export const serverEnvSchema = z.object({
  // Set by Coolify at runtime; empty means unknown.
  SOURCE_COMMIT: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type Source = Record<string, string | undefined>;

function parseWith<S extends z.ZodType>(schema: S, source: Source): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

export const parsePublicEnv = (source: Source): PublicEnv =>
  parseWith(publicEnvSchema, source);

export const parseServerEnv = (source: Source): ServerEnv =>
  parseWith(serverEnvSchema, source);
```

Note: `parseServerEnv({})` must deep-equal `{}`; if Zod emits `{ SOURCE_COMMIT: undefined }`, `toEqual` still passes (it ignores `undefined` properties).

`lib/env/public.ts`:

```ts
import { parsePublicEnv, type PublicEnv } from "./schema";

// Each variable is read explicitly so Next.js can inline it into client code;
// never pass `process.env` as a whole.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
```

`lib/env/server.ts`:

```ts
import "server-only";
import { parseServerEnv, type ServerEnv } from "./schema";

export const serverEnv: ServerEnv = parseServerEnv({
  SOURCE_COMMIT: process.env.SOURCE_COMMIT,
});
```

`next.config.ts` — replace the side-effect import with explicit validation (no `server-only` import here):

```ts
import type { NextConfig } from "next";
import { parsePublicEnv, parseServerEnv } from "./lib/env/schema";

// Throws during `next build`/`next start` if env is invalid.
parsePublicEnv(process.env);
parseServerEnv(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Applies to every response independent of page code, incl. assets and errors.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
```

`app/layout.tsx`: `import { publicEnv } from "@/lib/env/public";` and `metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL)`.

`vitest.config.mts` `test.env`:

```ts
    // lib/env validates at import time; unit tests get fixed valid values.
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit_test",
    },
```

Also add `"tests/integration/**"` to `test.exclude`.

`vitest.setup.ts` — append:

```ts
import { vi } from "vitest";

// `server-only` throws outside a React Server environment; unit tests run in
// plain Node/jsdom.
vi.mock("server-only", () => ({}));
```

`.github/workflows/ci.yml` job env (top of the existing job):

```yaml
env:
  NEXT_PUBLIC_SITE_URL: http://localhost:3000
  NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
  GITLEAKS_VERSION: 8.30.1
```

`.env.example` — append (Bash):

```bash
printf '\n# Supabase (local: values from `pnpm exec supabase status`)\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me\n\n# Set by Coolify at runtime\nSOURCE_COMMIT=\n' >> .env.example
```

Also add the two Supabase values to the developer's `.env.local` if it exists (from `pnpm exec supabase status -o json` after Task 2; until then the placeholders from `.env.example`).

- [ ] **Step 4: Run tests, typecheck, lint, build**

Run: `pnpm test && pnpm typecheck && pnpm lint && NEXT_PUBLIC_SITE_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_x pnpm build`
Expected: all exit 0.

- [ ] **Step 5: FR-1 review check (not committed)** — create `components/server-env-probe.tsx`:

```tsx
"use client";
import { serverEnv } from "@/lib/env/server";
export function ServerEnvProbe() {
  return <span>{serverEnv.SOURCE_COMMIT}</span>;
}
```

import it in `app/page.tsx`, run the build command from step 4, and record the error output (expected: build fails, message mentions `server-only`). Then `git checkout app/page.tsx && rm components/server-env-probe.tsx`. Paste the error excerpt into the task report.

- [ ] **Step 6: Commit**

```bash
git add lib/env app/layout.tsx next.config.ts vitest.config.mts vitest.setup.ts .github/workflows/ci.yml .env.example package.json pnpm-lock.yaml
git commit -m "refactor: split env into shared schema, public and server-only modules"
```

---

### Task 2: Supabase project, catalog schema and seed (FR-2, FR-3, FR-8)

**Files:**

- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261005090000_base.sql`, `supabase/migrations/20261005090100_catalog_tables.sql`, `supabase/seed.sql`, `supabase/tests/01_schema.test.sql`, `supabase/tests/02_constraints.test.sql`
- Modify: `package.json` (devDependency `supabase`, scripts), `pnpm-workspace.yaml`, `eslint.config.mjs`, `.prettierignore`

**Interfaces:**

- Produces: tables/enums exactly as in `docs/data-model.md`, plus `product.search` (added in Task 3); functions `private.set_updated_at()`, `private.is_admin()`, `private.check_article_attribute_type()`; seed rows with fixed ids listed below; scripts `db:start`, `db:stop`, `db:reset`, `db:test`, `db:types`.

Seed ids that later tasks rely on:

| Table               | Rows                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`          | 1 `moebelteile` (sort 0), 2 `sanitaer` (sort 1)                                                                                                                                                                                     |
| `attribute`         | 1 `height` decimal mm, 2 `pipe_diameter` decimal mm, 3 `surface` text                                                                                                                                                               |
| `material`          | 1 `PA-6`, 2 `POM`                                                                                                                                                                                                                   |
| `color`             | 1 weiß, 2 grau, 3 braun                                                                                                                                                                                                             |
| `product`           | 1 `testkeil-mit-daempfung` (cat 1, published, sort 0), 2 `testrohrschelle` (cat 2, published), 3 `testabdeckung` (cat 1, published, sort 1, no colours), 4 `entwurfsteil` (cat 1, draft), 5 `altteil` (cat 2, archived, no colours) |
| `article`           | 1 `99010` (p1, sort 0), 2 `99011` (p1, sort 1), 3 `99211/80` (p2), 4 `99300` (p3), 5 `99400` (p4), 6 `99500` (p5)                                                                                                                   |
| `product_color`     | (1,3,'1',default,sort 0), (1,1,'2',sort 1), (2,2,'0',default,sort 0), (2,1,'2',sort 1), (4,1,null,default)                                                                                                                          |
| `media`             | 1 `products/testkeil-1.webp` (→ p1 thumbnail), 2 `products/entwurfsteil-1.webp` (→ p4 thumbnail)                                                                                                                                    |
| `product_accessory` | (3, 2) visible; (1, 5) article of a draft product                                                                                                                                                                                   |
| `ai_generation`     | 1 row for product 1                                                                                                                                                                                                                 |

- [ ] **Step 1: Install and initialise the CLI**

```bash
pnpm add -D supabase@2.119.0
```

pnpm 10 blocks dependency build scripts; the `supabase` package downloads its binary in `postinstall`. Add it to `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - supabase
ignoredBuiltDependencies:
  - sharp
  - unrs-resolver
```

Then `pnpm install` (re-runs the postinstall) and `pnpm exec supabase --version` → `2.119.0`.

```bash
pnpm exec supabase init --with-intellij-settings=false --with-vscode-settings=false
```

In `supabase/config.toml` set `project_id = "baumann-demo"`, under `[auth]` set `enable_signup = false`, keep `[db.seed] sql_paths = ["./seed.sql"]`. Keep the generated `supabase/.gitignore`.

`package.json` scripts:

```json
"db:start": "supabase start -x studio,realtime,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:test": "supabase test db && vitest run --config vitest.integration.config.mts",
"db:types": "supabase gen types typescript --local --schema public > lib/supabase/database.types.ts"
```

(Until Task 5 creates the integration config, run pgTAP alone with `pnpm exec supabase test db`.)

`.prettierignore` — add `lib/supabase/database.types.ts` and `supabase/.temp`. `eslint.config.mjs` `globalIgnores` — add `"lib/supabase/database.types.ts"`.

Start the stack: `pnpm db:start` (first run pulls images).

- [ ] **Step 2 (test-writer): Write the failing tests**

`supabase/tests/01_schema.test.sql` (SC-2):

```sql
begin;
select plan(26);

select tables_are('public', array[
  'category', 'attribute', 'category_attribute', 'material', 'product',
  'article', 'article_attribute', 'article_packaging', 'product_accessory',
  'color', 'product_color', 'media', 'product_media', 'ai_generation'
], 'public schema has exactly the catalog tables');
select views_are('public', array['variant'], 'public schema has exactly the variant view');
select enums_are('public', array['product_status', 'content_origin', 'attribute_data_type', 'media_role'], 'catalog enums exist');
select enum_has_labels('public', 'product_status', array['draft', 'published', 'archived'], 'product_status labels');
select enum_has_labels('public', 'content_origin', array['human', 'ai', 'ai_edited'], 'content_origin labels');
select enum_has_labels('public', 'attribute_data_type', array['decimal', 'text'], 'attribute_data_type labels');
select enum_has_labels('public', 'media_role', array['thumbnail', 'gallery'], 'media_role labels');

select columns_are('public', 'category', array['id', 'slug', 'name', 'intro_text', 'seo_title', 'seo_description', 'sort_order'], 'category columns');
select columns_are('public', 'attribute', array['id', 'key', 'label', 'unit', 'data_type', 'sort_order'], 'attribute columns');
select columns_are('public', 'category_attribute', array['category_id', 'attribute_id', 'sort_order'], 'category_attribute columns');
select columns_are('public', 'material', array['id', 'code', 'name'], 'material columns');
select columns_are('public', 'product', array['id', 'category_id', 'slug', 'name', 'subtitle', 'description', 'material_id', 'material_note', 'status', 'sort_order', 'seo_title', 'seo_description', 'description_origin', 'seo_origin', 'legacy_product_id', 'created_at', 'updated_at', 'search'], 'product columns');
select columns_are('public', 'article', array['id', 'product_id', 'article_number', 'name', 'description', 'note', 'material_id', 'material_note', 'sort_order'], 'article columns');
select columns_are('public', 'article_attribute', array['article_id', 'attribute_id', 'value_decimal', 'value_text'], 'article_attribute columns');
select columns_are('public', 'article_packaging', array['article_id', 'quantity', 'label', 'sort_order'], 'article_packaging columns');
select columns_are('public', 'product_accessory', array['product_id', 'article_id', 'sort_order'], 'product_accessory columns');
select columns_are('public', 'color', array['id', 'name', 'ral_reference', 'hex_code', 'family'], 'color columns');
select columns_are('public', 'product_color', array['product_id', 'color_id', 'suffix', 'is_default', 'sort_order'], 'product_color columns');
select columns_are('public', 'media', array['id', 'storage_path', 'width', 'height', 'alt_text', 'alt_origin'], 'media columns');
select columns_are('public', 'product_media', array['product_id', 'media_id', 'role', 'sort_order'], 'product_media columns');
select columns_are('public', 'ai_generation', array['id', 'entity', 'entity_id', 'field', 'model', 'prompt_version', 'output', 'created_at', 'accepted_at'], 'ai_generation columns');

select col_type_is('public', 'article', 'article_number', 'text', 'article numbers are text (some contain a slash)');
select col_type_is('public', 'article_packaging', 'quantity', 'integer', 'pack sizes are integers');
select col_type_is('public', 'product', 'status', 'product_status', 'product status uses the enum');
select col_type_is('public', 'article_attribute', 'value_decimal', 'numeric', 'decimal attribute values are numeric');
select col_type_is('public', 'product', 'updated_at', 'timestamp with time zone', 'updated_at is timestamptz');

select * from finish();
rollback;
```

(`views_are` and the `search` column fail until Task 3 — expected. If pgTAP renders the enum type as `public.product_status`, use that spelling.)

`supabase/tests/02_constraints.test.sql` (SC-3, runs as `postgres` against the seed):

```sql
begin;
select plan(12);

select throws_ok(
  $$insert into public.article (product_id, article_number) values (1, '99010')$$,
  '23505', null, 'duplicate article_number is rejected');
select throws_ok(
  $$insert into public.article (product_id, article_number) values (1, '  ')$$,
  '23514', null, 'blank article_number is rejected');
select throws_ok(
  $$insert into public.product (category_id, slug, name) values (1, 'testkeil-mit-daempfung', 'Dup')$$,
  '23505', null, 'duplicate product slug in the same category is rejected');
select lives_ok(
  $$insert into public.product (category_id, slug, name) values (2, 'testkeil-mit-daempfung', 'Same slug elsewhere')$$,
  'the same product slug is allowed in another category');
select throws_ok(
  $$insert into public.product_color (product_id, color_id, suffix, is_default) values (1, 2, '3', true)$$,
  '23505', null, 'a second default colour per product is rejected');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_text) values (4, 1, 'acht')$$,
  '23514', null, 'a decimal attribute rejects a text value');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_decimal) values (1, 3, 1.5)$$,
  '23514', null, 'a text attribute rejects a decimal value');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id) values (4, 1)$$,
  '23514', null, 'an attribute row needs a value');
select lives_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_decimal) values (4, 1, 8.5)$$,
  'a matching decimal value is accepted');
select throws_ok(
  $$insert into public.article_packaging (article_id, quantity) values (1, 0)$$,
  '23514', null, 'pack size must be positive');
select throws_ok(
  $$insert into public.color (name, hex_code, family) values ('lila', 'purple', 'lila')$$,
  '23514', null, 'hex_code must be #RRGGBB');

update public.product set name = 'Testkeil mit Dämpfung' where id = 1;
select is((select updated_at from public.product where id = 1), now(), 'updated_at is refreshed on update');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec supabase test db`
Expected: FAIL (tables do not exist).

- [ ] **Step 4: Implement the migrations**

`supabase/migrations/20261005090000_base.sql`:

```sql
-- Extensions, helper schema, enums and helper functions for the catalog.

create extension if not exists pg_trgm with schema extensions;

-- Not exposed through the API (only `public` is in config.toml [api].schemas).
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create type public.product_status as enum ('draft', 'published', 'archived');
create type public.content_origin as enum ('human', 'ai', 'ai_edited');
create type public.attribute_data_type as enum ('decimal', 'text');
create type public.media_role as enum ('thumbnail', 'gallery');

-- True when the caller's JWT carries app_metadata.role = "admin". Only the
-- service role can write app_metadata, so users cannot grant it to themselves.
create function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

grant execute on function private.is_admin() to anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
```

`supabase/migrations/20261005090100_catalog_tables.sql`:

```sql
-- Catalog tables per docs/data-model.md.

create table public.category (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  intro_text text not null default '',
  seo_title text,
  seo_description text,
  sort_order integer not null default 0
);

create table public.attribute (
  id bigint generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (btrim(label) <> ''),
  unit text,
  data_type public.attribute_data_type not null,
  sort_order integer not null default 0
);

create table public.category_attribute (
  category_id bigint not null references public.category (id) on delete cascade,
  attribute_id bigint not null references public.attribute (id) on delete restrict,
  sort_order integer not null default 0,
  primary key (category_id, attribute_id)
);

create table public.material (
  id bigint generated always as identity primary key,
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> '')
);

create table public.product (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.category (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  subtitle text,
  description text,
  material_id bigint references public.material (id) on delete restrict,
  material_note text,
  status public.product_status not null default 'draft',
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  description_origin public.content_origin not null default 'human',
  seo_origin public.content_origin not null default 'human',
  legacy_product_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create trigger product_set_updated_at
  before update on public.product
  for each row execute function private.set_updated_at();

create table public.article (
  id bigint generated always as identity primary key,
  product_id bigint not null,
  article_number text not null unique check (btrim(article_number) <> ''),
  name text,
  description text,
  note text,
  material_id bigint references public.material (id) on delete restrict,
  material_note text,
  sort_order integer not null default 0,
  -- Named explicitly: PostgREST embeds need it to disambiguate article ↔ product
  -- (direct FK vs. the product_accessory junction).
  constraint article_product_id_fkey foreign key (product_id)
    references public.product (id) on delete cascade
);

create table public.article_attribute (
  article_id bigint not null references public.article (id) on delete cascade,
  attribute_id bigint not null references public.attribute (id) on delete restrict,
  value_decimal numeric,
  value_text text,
  primary key (article_id, attribute_id)
);

-- The value column must match the attribute's data_type.
create function private.check_article_attribute_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected public.attribute_data_type;
begin
  select data_type into expected from public.attribute where id = new.attribute_id;
  if expected is null then
    raise exception 'unknown attribute %', new.attribute_id using errcode = '23503';
  elsif expected = 'decimal' and (new.value_decimal is null or new.value_text is not null) then
    raise exception 'attribute % expects a decimal value', new.attribute_id using errcode = '23514';
  elsif expected = 'text' and (new.value_text is null or new.value_decimal is not null) then
    raise exception 'attribute % expects a text value', new.attribute_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger article_attribute_check_type
  before insert or update on public.article_attribute
  for each row execute function private.check_article_attribute_type();

create table public.article_packaging (
  article_id bigint not null references public.article (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  label text,
  sort_order integer not null default 0,
  primary key (article_id, quantity)
);

create table public.product_accessory (
  product_id bigint not null references public.product (id) on delete cascade,
  article_id bigint not null references public.article (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, article_id)
);

create table public.color (
  id bigint generated always as identity primary key,
  name text not null check (btrim(name) <> ''),
  ral_reference text,
  hex_code text not null check (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  family text not null check (btrim(family) <> '')
);

create table public.product_color (
  product_id bigint not null references public.product (id) on delete cascade,
  color_id bigint not null references public.color (id) on delete restrict,
  suffix text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  primary key (product_id, color_id)
);

-- At most one default colour per product. Never derive it from suffix = 0.
create unique index product_color_one_default_idx
  on public.product_color (product_id) where is_default;

create table public.media (
  id bigint generated always as identity primary key,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt_text text not null,
  alt_origin public.content_origin not null default 'human'
);

create table public.product_media (
  product_id bigint not null references public.product (id) on delete cascade,
  media_id bigint not null references public.media (id) on delete cascade,
  role public.media_role not null,
  sort_order integer not null default 0,
  primary key (product_id, media_id)
);

create unique index product_media_one_thumbnail_idx
  on public.product_media (product_id) where role = 'thumbnail';

create table public.ai_generation (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('category', 'product', 'article', 'media')),
  entity_id bigint not null,
  field text not null,
  model text not null,
  prompt_version text not null,
  output text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Foreign keys are not indexed automatically.
create index product_category_id_idx on public.product (category_id);
create index product_material_id_idx on public.product (material_id);
create index article_product_id_idx on public.article (product_id);
create index article_material_id_idx on public.article (material_id);
create index category_attribute_attribute_id_idx on public.category_attribute (attribute_id);
create index article_attribute_attribute_id_idx on public.article_attribute (attribute_id);
create index product_accessory_article_id_idx on public.product_accessory (article_id);
create index product_color_color_id_idx on public.product_color (color_id);
create index product_media_media_id_idx on public.product_media (media_id);
create index ai_generation_entity_idx on public.ai_generation (entity, entity_id);
```

`supabase/seed.sql` (local stack and CI only, never pushed):

```sql
-- Synthetic catalog data for local development and tests.
-- Invented names and numbers (99xxx); never customer data.

insert into public.category (id, slug, name, intro_text, sort_order) overriding system value values
  (1, 'moebelteile', 'Möbelteile (Beispiel)', 'Beispieltext für die Kategorie Möbelteile.', 0),
  (2, 'sanitaer', 'Sanitärteile (Beispiel)', 'Beispieltext für die Kategorie Sanitärteile.', 1);

insert into public.attribute (id, key, label, unit, data_type, sort_order) overriding system value values
  (1, 'height', 'Höhe', 'mm', 'decimal', 0),
  (2, 'pipe_diameter', 'für Rohr Ø', 'mm', 'decimal', 1),
  (3, 'surface', 'Oberfläche', null, 'text', 2);

insert into public.category_attribute (category_id, attribute_id, sort_order) values
  (1, 1, 0), (1, 3, 1), (2, 2, 0);

insert into public.material (id, code, name) overriding system value values
  (1, 'PA-6', 'Polyamid 6'),
  (2, 'POM', 'Polyoxymethylen');

insert into public.color (id, name, ral_reference, hex_code, family) overriding system value values
  (1, 'weiß', 'ähnlich RAL 9016', '#F4F4F4', 'weiß'),
  (2, 'grau', null, '#8A8D8F', 'grau'),
  (3, 'braun', null, '#6B4423', 'braun');

insert into public.product (id, category_id, slug, name, subtitle, description, material_id, status, sort_order) overriding system value values
  (1, 1, 'testkeil-mit-daempfung', 'Testkeil mit Dämpfung', 'für Beispielschlösser', 'Gedämpfter Keil für Möbeltüren. Beispieldaten.', 1, 'published', 0),
  (2, 2, 'testrohrschelle', 'Testrohrschelle', 'für Rohre bis 15 mm', 'Rohrschelle zur Befestigung an der Wand. Beispieldaten.', 2, 'published', 0),
  (3, 1, 'testabdeckung', 'Testabdeckung', null, 'Abdeckkappe ohne Farbvarianten. Beispieldaten.', null, 'published', 1),
  (4, 1, 'entwurfsteil', 'Entwurfsteil', null, 'Noch nicht veröffentlicht.', null, 'draft', 2),
  (5, 2, 'altteil', 'Altteil', null, 'Nicht mehr im Sortiment.', null, 'archived', 1);

insert into public.article (id, product_id, article_number, name, sort_order) overriding system value values
  (1, 1, '99010', 'Testkeil 8 mm', 0),
  (2, 1, '99011', 'Testkeil 10 mm', 1),
  (3, 2, '99211/80', 'Testrohrschelle 15 mm', 0),
  (4, 3, '99300', null, 0),
  (5, 4, '99400', null, 0),
  (6, 5, '99500', null, 0);

insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text) values
  (1, 1, 8, null),
  (2, 1, 10, null),
  (3, 2, 15, null),
  (4, 3, null, 'glatt'),
  (5, 1, 12, null);

insert into public.article_packaging (article_id, quantity, sort_order) values
  (1, 100, 0), (1, 500, 1), (3, 50, 0), (5, 10, 0);

insert into public.product_color (product_id, color_id, suffix, is_default, sort_order) values
  (1, 3, '1', true, 0),
  (1, 1, '2', false, 1),
  (2, 2, '0', true, 0),
  (2, 1, '2', false, 1),
  (4, 1, null, true, 0);

insert into public.media (id, storage_path, width, height, alt_text) overriding system value values
  (1, 'products/testkeil-1.webp', 800, 600, 'Testkeil mit Dämpfung, Seitenansicht'),
  (2, 'products/entwurfsteil-1.webp', 800, 600, 'Entwurfsteil');

insert into public.product_media (product_id, media_id, role, sort_order) values
  (1, 1, 'thumbnail', 0),
  (4, 2, 'thumbnail', 0);

-- (3, 2): visible accessory. (1, 5): accessory whose home product is a draft.
insert into public.product_accessory (product_id, article_id, sort_order) values
  (3, 2, 0),
  (1, 5, 0);

insert into public.ai_generation (id, entity, entity_id, field, model, prompt_version, output) overriding system value values
  (1, 'product', 1, 'description', 'test-model', 'v1', 'Beispieltext');

-- Fixed ids above; move identity sequences past them.
do $$
declare
  t text;
begin
  foreach t in array array['category', 'attribute', 'material', 'color', 'product', 'article', 'media', 'ai_generation'] loop
    execute format(
      'select setval(pg_get_serial_sequence(%L, ''id''), (select max(id) from public.%I))',
      'public.' || t, t);
  end loop;
end;
$$;
```

- [ ] **Step 5: Apply and run tests**

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: `02_constraints` passes; `01_schema` fails only on `views_are` and the `search` column (Task 3). Confirm exactly those two failures.

- [ ] **Step 6: Commit**

```bash
git add supabase package.json pnpm-lock.yaml pnpm-workspace.yaml eslint.config.mjs .prettierignore
git commit -m "feat: add supabase project with catalog schema, constraints and seed"
```

---

### Task 3: `variant` view and search groundwork (FR-4, FR-5)

**Files:**

- Create: `supabase/migrations/20261005090200_variant_and_search.sql`, `supabase/tests/03_variant_search.test.sql`

**Interfaces:**

- Consumes: tables and seed from Task 2.
- Produces: view `public.variant(article_id, product_id, article_number, color_id, suffix, is_default, order_number, article_sort_order, color_sort_order)`; column `product.search tsvector`; indexes `product_search_idx`, `article_article_number_trgm_idx`.

- [ ] **Step 1 (test-writer): Write the failing test** — `supabase/tests/03_variant_search.test.sql`

```sql
begin;
select plan(10);

select results_eq(
  $$select order_number from public.variant where product_id = 1 order by article_sort_order, color_sort_order$$,
  $$values ('99010 - 1'), ('99010 - 2'), ('99011 - 1'), ('99011 - 2')$$,
  'article × colour with suffix');
select results_eq(
  $$select order_number from public.variant where product_id = 2 order by color_sort_order$$,
  $$values ('99211/80 - 0'), ('99211/80 - 2')$$,
  'article numbers with a slash stay unchanged');
select results_eq(
  $$select order_number from public.variant where product_id = 2 and is_default$$,
  $$values ('99211/80 - 0')$$,
  'default colour is taken from is_default');
select results_eq(
  $$select order_number, color_id, is_default from public.variant where product_id = 3$$,
  $$values ('99300', null::bigint, true)$$,
  'a product without colours yields the bare article number');
select results_eq(
  $$select order_number from public.variant where product_id = 4$$,
  $$values ('99400')$$,
  'a null suffix yields the bare article number');

select ok(
  exists (select 1 from public.product where slug = 'testkeil-mit-daempfung' and search @@ websearch_to_tsquery('german', 'Dämpfungen')),
  'German stemming finds a product by an inflected name word');
select ok(
  exists (select 1 from public.product where slug = 'testrohrschelle' and search @@ websearch_to_tsquery('german', 'Befestigung Wand')),
  'full-text search covers the description');
select has_index('public', 'product', 'product_search_idx', 'GIN index on product.search');
select has_index('public', 'article', 'article_article_number_trgm_idx', 'trigram index on article_number');
select results_eq(
  $$select article_number from public.article where article_number ilike '%211/8%'$$,
  $$values ('99211/80')$$,
  'partial article number search works');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails** — `pnpm exec supabase test db` → FAIL (`relation "public.variant" does not exist`).

- [ ] **Step 3: Implement** — `supabase/migrations/20261005090200_variant_and_search.sql`:

```sql
-- The single place where order numbers are built (docs/data-model.md).
-- security_invoker: the caller's RLS applies to article and product_color;
-- without it the view would run as its owner and leak unpublished variants.
create view public.variant
with (security_invoker = true)
as
select
  a.id as article_id,
  a.product_id,
  a.article_number,
  pc.color_id,
  pc.suffix,
  coalesce(pc.is_default, true) as is_default,
  a.article_number || coalesce(' - ' || pc.suffix, '') as order_number,
  a.sort_order as article_sort_order,
  pc.sort_order as color_sort_order
from public.article a
left join public.product_color pc on pc.product_id = a.product_id;

alter table public.product
  add column search tsvector generated always as (
    setweight(to_tsvector('german', coalesce(name, '')), 'A')
    || setweight(to_tsvector('german', coalesce(subtitle, '')), 'B')
    || setweight(to_tsvector('german', coalesce(description, '')), 'C')
  ) stored;

create index product_search_idx on public.product using gin (search);
create index article_article_number_trgm_idx
  on public.article using gin (article_number extensions.gin_trgm_ops);
```

- [ ] **Step 4: Run** — `pnpm exec supabase db reset && pnpm exec supabase test db` → all of `01`–`03` pass.

- [ ] **Step 5: Commit** — `git add supabase && git commit -m "feat: add variant view and search indexes"`

---

### Task 4: RLS, grants and storage (FR-6, FR-7)

**Files:**

- Create: `supabase/migrations/20261005090300_rls_and_grants.sql`, `supabase/migrations/20261005090400_storage.sql`, `supabase/tests/04_rls.test.sql`, `supabase/tests/05_storage.test.sql`

**Interfaces:**

- Consumes: `private.is_admin()`, tables, view and seed from Tasks 2–3.
- Produces: visibility rules D2 (anon sees published product trees + reference data), admin-only writes, bucket `catalog`.

Role switching in pgTAP: `set local role anon; set local request.jwt.claims to '{"role":"anon"}';` — `auth.jwt()` reads `request.jwt.claims`. Admin claims: `{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}`. Non-admin: same without `app_metadata`. `reset role;` returns to `postgres`.

- [ ] **Step 1 (test-writer): Write the failing tests**

`supabase/tests/04_rls.test.sql` (SC-6):

```sql
begin;
select plan(30);

-- Structure
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'RLS is enabled on every public table');
select ok(
  (select coalesce('security_invoker=true' = any (reloptions), false) from pg_class where oid = 'public.variant'::regclass),
  'variant view runs with the caller''s rights');
select is(
  (select count(*) from pg_tables t
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) v(cmd)
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = v.cmd
         and coalesce(p.qual, p.with_check) like '%is_admin%')),
  0::bigint, 'every table has admin-only insert, update and delete policies');

-- Grants (defence in depth, D4). has_table_privilege is independent of the
-- role running the test, unlike information_schema views.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')
       or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('anon', c.oid, 'TRIGGER'))),
  0::bigint, 'anon holds no privilege except SELECT on public tables and views');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and not has_table_privilege('anon', c.oid, 'SELECT')),
  0::bigint, 'anon may select every public table and view');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
       or has_table_privilege('authenticated', c.oid, 'REFERENCES')
       or has_table_privilege('authenticated', c.oid, 'TRIGGER'))),
  0::bigint, 'no TRUNCATE (bypasses RLS), REFERENCES or TRIGGER for authenticated');

-- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq($$select slug from public.product order by id$$,
  $$values ('testkeil-mit-daempfung'), ('testrohrschelle'), ('testabdeckung')$$,
  'anon sees published products only');
select is((select count(*) from public.article where product_id in (4, 5)), 0::bigint, 'anon sees no articles of unpublished products');
select is((select count(*) from public.variant where product_id in (4, 5)), 0::bigint, 'anon sees no variants of unpublished products');
select is((select count(*) from public.product_color where product_id = 4), 0::bigint, 'anon sees no colours of unpublished products');
select results_eq($$select storage_path from public.media order by id$$,
  $$values ('products/testkeil-1.webp')$$, 'anon sees media of published products only');
select is((select count(*) from public.product_media where product_id = 4), 0::bigint, 'anon sees no media links of unpublished products');
select is((select count(*) from public.article_attribute where article_id = 5), 0::bigint, 'anon sees no attributes of unpublished articles');
select is((select count(*) from public.article_packaging where article_id = 5), 0::bigint, 'anon sees no pack sizes of unpublished articles');
select results_eq($$select product_id, article_id from public.product_accessory order by product_id, article_id$$,
  $$values (3::bigint, 2::bigint)$$, 'anon sees accessories only when both products are published');
select is((select count(*) from public.ai_generation), 0::bigint, 'anon sees no AI audit log');
select ok(
  (select count(*) from public.category) = 2 and (select count(*) from public.color) = 3
  and (select count(*) from public.material) = 2 and (select count(*) from public.attribute) = 3
  and (select count(*) from public.category_attribute) = 3,
  'anon reads reference data');
select throws_ok($$insert into public.category (slug, name) values ('x', 'X')$$, '42501', null, 'anon cannot insert');
select throws_ok($$update public.product set name = 'x'$$, '42501', null, 'anon cannot update');
select throws_ok($$delete from public.article$$, '42501', null, 'anon cannot delete');

reset role;

-- authenticated, not admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*) from public.product where status <> 'published'), 0::bigint, 'non-admin sees no unpublished products');
select is((select count(*) from public.ai_generation), 0::bigint, 'non-admin sees no AI audit log');
select throws_ok($$insert into public.category (slug, name) values ('x', 'X')$$, '42501', null, 'non-admin cannot insert');
select results_eq($$with u as (update public.product set name = 'hacked' returning 1) select count(*) from u$$,
  $$values (0::bigint)$$, 'non-admin update changes no rows');
select results_eq($$with d as (delete from public.article returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'non-admin delete removes no rows');

reset role;

-- admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';

select is((select count(*) from public.product), 5::bigint, 'admin sees all products');
select is((select count(*) from public.ai_generation), 1::bigint, 'admin reads the AI audit log');

select lives_ok($$
do $body$
declare
  v_category bigint; v_material bigint; v_attribute bigint; v_product bigint;
  v_article bigint; v_color bigint; v_media bigint;
begin
  insert into public.category (slug, name) values ('neu', 'Neu') returning id into v_category;
  insert into public.material (code, name) values ('ABS', 'ABS') returning id into v_material;
  insert into public.attribute (key, label, unit, data_type) values ('width', 'Breite', 'mm', 'decimal') returning id into v_attribute;
  insert into public.category_attribute (category_id, attribute_id) values (v_category, v_attribute);
  insert into public.product (category_id, slug, name, material_id) values (v_category, 'neues-teil', 'Neues Teil', v_material) returning id into v_product;
  insert into public.article (product_id, article_number) values (v_product, '99900') returning id into v_article;
  insert into public.article_attribute (article_id, attribute_id, value_decimal) values (v_article, v_attribute, 12.5);
  insert into public.article_packaging (article_id, quantity) values (v_article, 100);
  insert into public.color (name, hex_code, family) values ('schwarz', '#000000', 'schwarz') returning id into v_color;
  insert into public.product_color (product_id, color_id, suffix, is_default) values (v_product, v_color, '5', true);
  insert into public.media (storage_path, width, height, alt_text) values ('products/neu.webp', 800, 600, 'Neues Teil') returning id into v_media;
  insert into public.product_media (product_id, media_id, role) values (v_product, v_media, 'thumbnail');
  insert into public.product_accessory (product_id, article_id) values (v_product, 1);
  insert into public.ai_generation (entity, entity_id, field, model, prompt_version, output) values ('product', v_product, 'description', 'test-model', 'v1', 'Text');
end;
$body$
$$, 'admin can insert into every table');

select lives_ok($$
do $body$
declare
  n integer;
  stmt text;
begin
  foreach stmt in array array[
    $s$update public.category set name = 'Neu 2' where slug = 'neu'$s$,
    $s$update public.material set name = 'ABS 2' where code = 'ABS'$s$,
    $s$update public.attribute set label = 'Breite 2' where key = 'width'$s$,
    $s$update public.category_attribute set sort_order = 9 where attribute_id = (select id from public.attribute where key = 'width')$s$,
    $s$update public.product set name = 'Neues Teil 2' where slug = 'neues-teil'$s$,
    $s$update public.article set name = 'Neu' where article_number = '99900'$s$,
    $s$update public.article_attribute set value_decimal = 13 where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$update public.article_packaging set label = 'Karton' where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$update public.color set family = 'schwarz2' where name = 'schwarz'$s$,
    $s$update public.product_color set sort_order = 9 where suffix = '5'$s$,
    $s$update public.media set alt_text = 'Neu 2' where storage_path = 'products/neu.webp'$s$,
    $s$update public.product_media set sort_order = 9 where media_id = (select id from public.media where storage_path = 'products/neu.webp')$s$,
    $s$update public.product_accessory set sort_order = 9 where product_id = (select id from public.product where slug = 'neues-teil')$s$,
    $s$update public.ai_generation set accepted_at = now() where output = 'Text'$s$
  ] loop
    execute stmt;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'expected 1 row for: %', stmt; end if;
  end loop;
end;
$body$
$$, 'admin can update every table');

select lives_ok($$
do $body$
declare
  n integer;
  stmt text;
begin
  foreach stmt in array array[
    $s$delete from public.ai_generation where output = 'Text'$s$,
    $s$delete from public.product_accessory where product_id = (select id from public.product where slug = 'neues-teil')$s$,
    $s$delete from public.product_media where media_id = (select id from public.media where storage_path = 'products/neu.webp')$s$,
    $s$delete from public.media where storage_path = 'products/neu.webp'$s$,
    $s$delete from public.product_color where suffix = '5'$s$,
    $s$delete from public.color where name = 'schwarz'$s$,
    $s$delete from public.article_packaging where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$delete from public.article_attribute where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$delete from public.article where article_number = '99900'$s$,
    $s$delete from public.product where slug = 'neues-teil'$s$,
    $s$delete from public.category_attribute where attribute_id = (select id from public.attribute where key = 'width')$s$,
    $s$delete from public.attribute where key = 'width'$s$,
    $s$delete from public.category where slug = 'neu'$s$,
    $s$delete from public.material where code = 'ABS'$s$
  ] loop
    execute stmt;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'expected 1 row for: %', stmt; end if;
  end loop;
end;
$body$
$$, 'admin can delete from every table');

select * from finish();
rollback;
```

`supabase/tests/05_storage.test.sql` (SC-7):

```sql
begin;
select plan(7);

insert into storage.objects (bucket_id, name) values ('catalog', 'products/seeded.webp');

select ok((select public from storage.buckets where id = 'catalog'), 'catalog bucket is public');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'anon.webp')$$,
  '42501', null, 'anon cannot upload');
select is((select count(*) from storage.objects where bucket_id = 'catalog'), 0::bigint,
  'anon cannot list objects (public URLs work without a select policy)');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'user.webp')$$,
  '42501', null, 'non-admin cannot upload');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'products/admin.webp')$$,
  'admin can upload');
select ok((select count(*) from storage.objects where bucket_id = 'catalog') >= 2, 'admin can list objects');
reset role;

-- Direct SQL deletes on storage.objects may be blocked by a storage trigger,
-- so the delete/update rules are checked structurally.
select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE')
     and qual like '%catalog%' and qual like '%is_admin%'),
  2::bigint, 'update and delete on catalog objects are admin-only');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify they fail** — `pnpm exec supabase test db` → FAIL (RLS disabled, no bucket).

- [ ] **Step 3: Implement**

`supabase/migrations/20261005090300_rls_and_grants.sql`:

```sql
-- RLS is the security boundary (ADR 0001). Visibility follows the product (D2).

-- Grants first (D4): explicit, so self-hosted defaults do not matter.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'category', 'attribute', 'category_attribute', 'material', 'product',
    'article', 'article_attribute', 'article_packaging', 'product_accessory',
    'color', 'product_color', 'media', 'product_media', 'ai_generation'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admin insert" on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admin update" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admin delete" on public.%I for delete to authenticated using ((select private.is_admin()))', t);
  end loop;
end;
$$;

-- Reference data: readable by everyone.
create policy "public read" on public.category for select to anon, authenticated using (true);
create policy "public read" on public.attribute for select to anon, authenticated using (true);
create policy "public read" on public.category_attribute for select to anon, authenticated using (true);
create policy "public read" on public.material for select to anon, authenticated using (true);
create policy "public read" on public.color for select to anon, authenticated using (true);

-- Products: published for everyone, everything for the admin.
create policy "read published or admin" on public.product for select to anon, authenticated
  using (status = 'published' or (select private.is_admin()));

-- Children: visible when the parent row is visible to the caller. The
-- subqueries run under the caller's RLS, so visibility cascades.
create policy "read with product" on public.article for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = article.product_id));
create policy "read with product" on public.product_color for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = product_color.product_id));
create policy "read with product" on public.product_media for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = product_media.product_id));
create policy "read with article" on public.article_attribute for select to anon, authenticated
  using (exists (select 1 from public.article a where a.id = article_attribute.article_id));
create policy "read with article" on public.article_packaging for select to anon, authenticated
  using (exists (select 1 from public.article a where a.id = article_packaging.article_id));
create policy "read with both products" on public.product_accessory for select to anon, authenticated
  using (
    exists (select 1 from public.product p where p.id = product_accessory.product_id)
    and exists (select 1 from public.article a where a.id = product_accessory.article_id)
  );
-- Media: linked to a visible product, or any media for the admin (uploads
-- exist before they are linked).
create policy "read linked or admin" on public.media for select to anon, authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.product_media pm where pm.media_id = media.id)
  );

create policy "admin read" on public.ai_generation for select to authenticated
  using ((select private.is_admin()));
```

`supabase/migrations/20261005090400_storage.sql`:

```sql
-- Catalog images. Public bucket: files are served by public URL without a
-- select policy; listing and writes are admin-only.
insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do nothing;

create policy "catalog admin read" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()))
  with check (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()));
```

- [ ] **Step 4: Run** — `pnpm exec supabase db reset && pnpm exec supabase test db` → all five files pass. If the generic write-policy check (test 3) fails because `pg_policies.qual` shows `( SELECT private.is_admin() AS is_admin)`, the `like '%is_admin%'` still matches; any other failure is a real defect.

- [ ] **Step 5: Commit** — `git add supabase && git commit -m "feat: enforce rls, grants and storage policies for the catalog"`

---

### Task 5: Generated types, Supabase client and catalog read functions (FR-9, FR-10)

**Files:**

- Create: `lib/supabase/database.types.ts` (generated), `lib/supabase/server.ts`, `lib/result.ts`, `lib/catalog/types.ts`, `lib/catalog/errors.ts`, `lib/catalog/categories.ts`, `lib/catalog/product.ts`, `tests/integration/setup.ts`, `tests/integration/catalog.test.ts`, `vitest.integration.config.mts`
- Modify: `package.json` (dependency `@supabase/supabase-js`)

**Interfaces:**

- Consumes: seed ids (Task 2), `variant` view (Task 3), RLS (Task 4), `publicEnv` (Task 1).
- Produces:
  - `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`, `ok(value)`, `err(error)`
  - `type CatalogClient = SupabaseClient<Database>`, `createServerSupabase(): CatalogClient`
  - `type CatalogError = { kind: "not_found" } | { kind: "db_error"; code: string | null; message: string }`
  - `listCategories(client?: CatalogClient): Promise<Result<CategorySummary[], CatalogError>>`
  - `getCategoryPage(slug: string, client?: CatalogClient): Promise<Result<CategoryPage, CatalogError>>`
  - `getProductPage(categorySlug: string, productSlug: string, client?: CatalogClient): Promise<Result<ProductPage, CatalogError>>`

- [ ] **Step 1: Generate types and add the client dependency**

```bash
pnpm add @supabase/supabase-js@^2.117.2
mkdir -p lib/supabase && pnpm db:types
```

Expected: `lib/supabase/database.types.ts` contains `product_status`, `variant` under `Views`.

- [ ] **Step 2 (test-writer): Write the failing integration test**

`vitest.integration.config.mts`:

```ts
import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

// Keys of the running local stack (`pnpm db:start`).
const status: unknown = JSON.parse(
  execSync("pnpm exec supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
);
if (
  typeof status !== "object" ||
  status === null ||
  !("API_URL" in status) ||
  !("PUBLISHABLE_KEY" in status) ||
  typeof status.API_URL !== "string" ||
  typeof status.PUBLISHABLE_KEY !== "string"
) {
  throw new Error("Local Supabase is not running — run `pnpm db:start`.");
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    },
  },
});
```

`tests/integration/setup.ts`:

```ts
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
```

`tests/integration/catalog.test.ts` (SC-10; runs as `anon` against the seed):

```ts
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getCategoryPage, listCategories } from "@/lib/catalog/categories";
import { getProductPage } from "@/lib/catalog/product";
import type { Database } from "@/lib/supabase/database.types";

// Nothing listens on port 9; requests fail at the network level.
const unreachable = createClient<Database>(
  "http://127.0.0.1:9",
  "sb_publishable_unreachable",
  { auth: { persistSession: false } }
);

describe("listCategories (FR-10, SC-10)", () => {
  it("returns all categories in sort order", async () => {
    const result = await listCategories();
    expect(result).toEqual({
      ok: true,
      value: [
        { slug: "moebelteile", name: "Möbelteile (Beispiel)" },
        { slug: "sanitaer", name: "Sanitärteile (Beispiel)" },
      ],
    });
  });

  it("returns a db_error instead of throwing when the database is unreachable", async () => {
    const result = await listCategories(unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

describe("getCategoryPage (FR-10, SC-10)", () => {
  it("returns the category with its published products in sort order", async () => {
    const result = await getCategoryPage("moebelteile");
    expect(result).toEqual({
      ok: true,
      value: {
        slug: "moebelteile",
        name: "Möbelteile (Beispiel)",
        introText: "Beispieltext für die Kategorie Möbelteile.",
        seoTitle: null,
        seoDescription: null,
        products: [
          {
            slug: "testkeil-mit-daempfung",
            name: "Testkeil mit Dämpfung",
            subtitle: "für Beispielschlösser",
          },
          { slug: "testabdeckung", name: "Testabdeckung", subtitle: null },
        ],
      },
    });
  });

  it("returns not_found for an unknown slug", async () => {
    expect(await getCategoryPage("gibt-es-nicht")).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await getCategoryPage("moebelteile", unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

describe("getProductPage (FR-10, SC-10)", () => {
  it("returns the full product page", async () => {
    const result = await getProductPage(
      "moebelteile",
      "testkeil-mit-daempfung"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.value;

    expect(page).toMatchObject({
      slug: "testkeil-mit-daempfung",
      name: "Testkeil mit Dämpfung",
      subtitle: "für Beispielschlösser",
      descriptionOrigin: "human",
      category: { slug: "moebelteile", name: "Möbelteile (Beispiel)" },
      material: { code: "PA-6", name: "Polyamid 6" },
    });
    expect(page.articles.map((a) => a.articleNumber)).toEqual([
      "99010",
      "99011",
    ]);
    expect(page.articles[0]).toMatchObject({
      name: "Testkeil 8 mm",
      attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 8 }],
      packaging: [
        { quantity: 100, label: null },
        { quantity: 500, label: null },
      ],
    });
    expect(page.colors.map((c) => [c.name, c.suffix, c.isDefault])).toEqual([
      ["braun", "1", true],
      ["weiß", "2", false],
    ]);
    expect(page.variants.map((v) => v.orderNumber)).toEqual([
      "99010 - 1",
      "99010 - 2",
      "99011 - 1",
      "99011 - 2",
    ]);
    expect(page.media).toEqual([
      {
        storagePath: "products/testkeil-1.webp",
        width: 800,
        height: 600,
        altText: "Testkeil mit Dämpfung, Seitenansicht",
        altOrigin: "human",
        role: "thumbnail",
      },
    ]);
    // The only accessory's home product is a draft (Review Focus 3).
    expect(page.accessories).toEqual([]);
  });

  it("returns accessories and colourless variants", async () => {
    const result = await getProductPage("moebelteile", "testabdeckung");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.colors).toEqual([]);
    expect(result.value.variants.map((v) => v.orderNumber)).toEqual(["99300"]);
    expect(result.value.accessories).toEqual([
      {
        articleNumber: "99011",
        name: "Testkeil 10 mm",
        productSlug: "testkeil-mit-daempfung",
        productName: "Testkeil mit Dämpfung",
        categorySlug: "moebelteile",
      },
    ]);
  });

  it.each([
    ["an unpublished product", "moebelteile", "entwurfsteil"],
    ["an archived product", "sanitaer", "altteil"],
    ["a product in another category", "sanitaer", "testkeil-mit-daempfung"],
    ["an unknown product", "moebelteile", "gibt-es-nicht"],
    ["an unknown category", "gibt-es-nicht", "testkeil-mit-daempfung"],
  ])("returns not_found for %s", async (_label, categorySlug, productSlug) => {
    expect(await getProductPage(categorySlug, productSlug)).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await getProductPage(
      "moebelteile",
      "testkeil-mit-daempfung",
      unreachable
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.mts`
Expected: FAIL — `Cannot find module '@/lib/catalog/categories'`.

- [ ] **Step 4: Implement**

`lib/result.ts`:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

`lib/supabase/server.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export type CatalogClient = SupabaseClient<Database>;

// Public reads run as `anon` with the publishable key, so RLS decides what is
// visible. Sessions (admin) come with @supabase/ssr in feature 6.
export function createServerSupabase(): CatalogClient {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
```

`lib/catalog/types.ts`:

```ts
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type ContentOrigin = Enums["content_origin"];
export type MediaRole = Enums["media_role"];

export type CatalogError =
  | { kind: "not_found" }
  | { kind: "db_error"; code: string | null; message: string };

export type CategorySummary = { slug: string; name: string };

export type ProductSummary = {
  slug: string;
  name: string;
  subtitle: string | null;
};

export type CategoryPage = CategorySummary & {
  introText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  products: ProductSummary[];
};

export type Material = { code: string; name: string };

export type ArticleAttributeView = {
  key: string;
  label: string;
  unit: string | null;
  value: number | string;
};

export type ArticleView = {
  articleNumber: string;
  name: string | null;
  description: string | null;
  note: string | null;
  material: Material | null;
  materialNote: string | null;
  attributes: ArticleAttributeView[];
  packaging: { quantity: number; label: string | null }[];
};

export type ColorView = {
  name: string;
  ralReference: string | null;
  hexCode: string;
  family: string;
  suffix: string | null;
  isDefault: boolean;
};

export type VariantView = {
  orderNumber: string;
  articleNumber: string;
  suffix: string | null;
  isDefault: boolean;
};

export type MediaView = {
  storagePath: string;
  width: number;
  height: number;
  altText: string;
  altOrigin: ContentOrigin;
  role: MediaRole;
};

export type AccessoryView = {
  articleNumber: string;
  name: string | null;
  productSlug: string;
  productName: string;
  categorySlug: string;
};

export type ProductPage = ProductSummary & {
  description: string | null;
  descriptionOrigin: ContentOrigin;
  seoTitle: string | null;
  seoDescription: string | null;
  seoOrigin: ContentOrigin;
  category: CategorySummary;
  material: Material | null;
  materialNote: string | null;
  articles: ArticleView[];
  colors: ColorView[];
  variants: VariantView[];
  media: MediaView[];
  accessories: AccessoryView[];
};
```

`lib/catalog/errors.ts`:

```ts
import { err, type Result } from "@/lib/result";
import type { CatalogError } from "./types";

type PostgrestLikeError = { code?: string; message: string };

export function toDbError(error: PostgrestLikeError): CatalogError {
  return { kind: "db_error", code: error.code || null, message: error.message };
}

// supabase-js reports most failures as values, but network errors can still
// throw depending on the fetch implementation; never let them escape.
export async function guard<T>(
  run: () => Promise<Result<T, CatalogError>>
): Promise<Result<T, CatalogError>> {
  try {
    return await run();
  } catch (cause) {
    return err({
      kind: "db_error",
      code: null,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
```

`lib/catalog/categories.ts`:

```ts
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError, CategoryPage, CategorySummary } from "./types";

export function listCategories(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategorySummary[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select("slug, name")
      .order("sort_order")
      .order("name");
    if (error) return err(toDbError(error));
    return ok(data);
  });
}

export function getCategoryPage(
  slug: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<CategoryPage, CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select(
        "slug, name, intro_text, seo_title, seo_description, product(slug, name, subtitle, sort_order)"
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) return err(toDbError(error));
    if (!data) return err({ kind: "not_found" });

    // RLS already limits `product` to published rows for anon.
    const products = [...data.product]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, "de")
      )
      .map(({ slug, name, subtitle }) => ({ slug, name, subtitle }));

    return ok({
      slug: data.slug,
      name: data.name,
      introText: data.intro_text,
      seoTitle: data.seo_title,
      seoDescription: data.seo_description,
      products,
    });
  });
}
```

`lib/catalog/product.ts`:

```ts
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { ArticleView, CatalogError, ProductPage } from "./types";

// `!article_product_id_fkey` disambiguates article ↔ product: there is a direct
// foreign key and the product_accessory junction.
const PRODUCT_SELECT = `
  id, slug, name, subtitle, description, description_origin,
  seo_title, seo_description, seo_origin, material_note,
  category!inner(slug, name),
  material(code, name),
  article!article_product_id_fkey(
    article_number, name, description, note, material_note, sort_order,
    material(code, name),
    article_attribute(value_decimal, value_text, attribute(key, label, unit, sort_order)),
    article_packaging(quantity, label, sort_order)
  ),
  product_color(suffix, is_default, sort_order, color(name, ral_reference, hex_code, family)),
  product_media(role, sort_order, media(storage_path, width, height, alt_text, alt_origin)),
  product_accessory(sort_order, article(article_number, name, product!article_product_id_fkey(slug, name, category(slug))))
`;

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

export function getProductPage(
  categorySlug: string,
  productSlug: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<ProductPage, CatalogError>> {
  return guard(async () => {
    const { data: row, error } = await client
      .from("product")
      .select(PRODUCT_SELECT)
      .eq("slug", productSlug)
      .eq("category.slug", categorySlug)
      .maybeSingle();
    if (error) return err(toDbError(error));
    if (!row) return err({ kind: "not_found" });

    const { data: variants, error: variantError } = await client
      .from("variant")
      .select("order_number, article_number, suffix, is_default")
      .eq("product_id", row.id)
      .order("article_sort_order")
      .order("color_sort_order", { nullsFirst: true });
    if (variantError) return err(toDbError(variantError));

    const articles: ArticleView[] = [...row.article]
      .sort(bySortOrder)
      .map((a) => ({
        articleNumber: a.article_number,
        name: a.name,
        description: a.description,
        note: a.note,
        material: a.material,
        materialNote: a.material_note,
        attributes: [...a.article_attribute]
          .sort((x, y) => x.attribute.sort_order - y.attribute.sort_order)
          .map((v) => ({
            key: v.attribute.key,
            label: v.attribute.label,
            unit: v.attribute.unit,
            value: v.value_decimal ?? v.value_text ?? "",
          })),
        packaging: [...a.article_packaging]
          .sort(bySortOrder)
          .map(({ quantity, label }) => ({ quantity, label })),
      }));

    return ok({
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle,
      description: row.description,
      descriptionOrigin: row.description_origin,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      seoOrigin: row.seo_origin,
      category: row.category,
      material: row.material,
      materialNote: row.material_note,
      articles,
      colors: [...row.product_color].sort(bySortOrder).map((c) => ({
        name: c.color.name,
        ralReference: c.color.ral_reference,
        hexCode: c.color.hex_code,
        family: c.color.family,
        suffix: c.suffix,
        isDefault: c.is_default,
      })),
      variants: variants.flatMap((v) =>
        v.order_number === null || v.article_number === null
          ? []
          : [
              {
                orderNumber: v.order_number,
                articleNumber: v.article_number,
                suffix: v.suffix,
                isDefault: v.is_default ?? false,
              },
            ]
      ),
      media: [...row.product_media]
        .sort((a, b) =>
          a.role === b.role
            ? a.sort_order - b.sort_order
            : a.role === "thumbnail"
              ? -1
              : 1
        )
        .map((m) => ({
          storagePath: m.media.storage_path,
          width: m.media.width,
          height: m.media.height,
          altText: m.media.alt_text,
          altOrigin: m.media.alt_origin,
          role: m.role,
        })),
      accessories: [...row.product_accessory].sort(bySortOrder).map((acc) => ({
        articleNumber: acc.article.article_number,
        name: acc.article.name,
        productSlug: acc.article.product.slug,
        productName: acc.article.product.name,
        categorySlug: acc.article.product.category.slug,
      })),
    });
  });
}
```

Notes for the implementer:

- View columns are nullable in generated types; the `flatMap` narrows them without `!`.
- If supabase-js infers an embedded to-one relation as an array or as nullable (e.g. `category!inner`), narrow explicitly; do not cast with `as`. If inference fails on the multi-line select string, use `.returns<…>()` only as a last resort and document why.
- `value_decimal` arrives as a JSON number for `numeric` via PostgREST; if it arrives as a string, convert with `Number()` and add a unit test for the conversion.

- [ ] **Step 5: Run**

Run: `pnpm exec vitest run --config vitest.integration.config.mts && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 6: Type drift check** — `pnpm db:types && git diff --exit-code -- lib/supabase/database.types.ts` → exit 0 (after committing the file once).

- [ ] **Step 7: Commit**

```bash
git add lib/supabase lib/result.ts lib/catalog tests/integration vitest.integration.config.mts package.json pnpm-lock.yaml
git commit -m "feat: add typed supabase client and catalog read functions"
```

---

### Task 6: Health endpoint (FR-11)

**Files:**

- Create: `lib/health.ts`, `lib/health.test.ts`, `app/api/health/route.ts`, `app/api/health/route.test.ts`

**Interfaces:**

- Consumes: `createServerSupabase`, `CatalogClient` (Task 5), `serverEnv` (Task 1).
- Produces: `type Health = { commit: string; db: "ok" | "error" }`, `type DbProbe = (signal: AbortSignal) => Promise<boolean>`, `checkHealth(probe: DbProbe, commit: string | undefined, timeoutMs?: number): Promise<Health>`, `supabaseProbe(client: CatalogClient): DbProbe`; `GET /api/health`.

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (route handlers) and the `dynamic` segment config page before writing the route.

- [ ] **Step 1 (test-writer): Write the failing tests**

`lib/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth (FR-11, SC-11)", () => {
  it("reports ok when the probe succeeds", async () => {
    expect(await checkHealth(async () => true, "abc123")).toEqual({
      commit: "abc123",
      db: "ok",
    });
  });

  it("reports error when the probe returns false", async () => {
    expect(await checkHealth(async () => false, "abc123")).toEqual({
      commit: "abc123",
      db: "error",
    });
  });

  it("reports error when the probe throws", async () => {
    const probe = async () => {
      throw new Error("connection refused");
    };
    expect((await checkHealth(probe, "abc123")).db).toBe("error");
  });

  it("reports error when the probe hangs longer than the timeout", async () => {
    const hanging = () => new Promise<boolean>(() => {});
    const started = Date.now();
    expect((await checkHealth(hanging, "abc123", 50)).db).toBe("error");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("passes an abort signal that fires on timeout", async () => {
    let aborted = false;
    const probe = (signal: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve(false);
        });
      });
    await checkHealth(probe, "abc123", 20);
    expect(aborted).toBe(true);
  });

  it("uses 'unknown' when no commit is configured", async () => {
    expect((await checkHealth(async () => true, undefined)).commit).toBe(
      "unknown"
    );
  });
});
```

`app/api/health/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({ serverEnv: { SOURCE_COMMIT: "abc123" } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({}) }));
vi.mock("@/lib/health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/health")>();
  return { ...actual, supabaseProbe: () => async () => false };
});

describe("GET /api/health (FR-11, SC-11)", () => {
  it("answers 200 with commit and db status, never cached", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ commit: "abc123", db: "error" });
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm exec vitest run lib/health.test.ts app/api/health` → FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/health.ts`:

```ts
import type { CatalogClient } from "@/lib/supabase/server";

export type Health = { commit: string; db: "ok" | "error" };
export type DbProbe = (signal: AbortSignal) => Promise<boolean>;

const DEFAULT_TIMEOUT_MS = 3000;

// Never throws and never hangs: Docker health checks and the deploy smoke
// check depend on a fast answer.
export async function checkHealth(
  probe: DbProbe,
  commit: string | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Health> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });

  let dbOk = false;
  try {
    dbOk = await Promise.race([probe(controller.signal), timeout]);
  } catch {
    dbOk = false;
  } finally {
    clearTimeout(timer);
  }
  return { commit: commit ?? "unknown", db: dbOk ? "ok" : "error" };
}

export function supabaseProbe(client: CatalogClient): DbProbe {
  return async (signal) => {
    const { error } = await client
      .from("category")
      .select("id", { head: true, count: "exact" })
      .abortSignal(signal);
    return error === null;
  };
}
```

`app/api/health/route.ts`:

```ts
import { serverEnv } from "@/lib/env/server";
import { checkHealth, supabaseProbe } from "@/lib/health";
import { createServerSupabase } from "@/lib/supabase/server";

// Evaluated per request: reports the running commit and live DB status.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const health = await checkHealth(
    supabaseProbe(createServerSupabase()),
    serverEnv.SOURCE_COMMIT
  );
  return Response.json(health, { headers: { "Cache-Control": "no-store" } });
}
```

(If the Next 16 docs say `dynamic` is not supported in this config, use the documented equivalent and note it in the report.)

- [ ] **Step 4: Run** — `pnpm test && pnpm typecheck && pnpm lint` → green.

- [ ] **Step 5: Manual check** — with the local stack running and `.env.local` holding the local Supabase values: `pnpm build && pnpm start`, then `curl -s localhost:3000/api/health` → `{"commit":"unknown","db":"ok"}`; `curl -sI localhost:3000/api/health | grep -i x-robots-tag` → `noindex, nofollow`. Record output.

- [ ] **Step 6: Commit** — `git add lib/health.ts lib/health.test.ts app/api/health && git commit -m "feat: add health endpoint with commit and database status"`

---

### Task 7: Standalone Docker image (FR-12)

**Files:**

- Create: `Dockerfile`, `.dockerignore`
- Modify: `next.config.ts` (`output: "standalone"`)

**Interfaces:**

- Consumes: env names (Task 1), `/api/health` (Task 6).
- Produces: image listening on port 3000 as non-root user `nextjs`; build args `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` first.

- [ ] **Step 1: Write the failing check** — there is no unit test for a Dockerfile; the check is the build + run below. Run it first to see it fail:

Run: `docker build -t baumann-demo:local .`
Expected: FAIL (no Dockerfile).

- [ ] **Step 2: Implement**

`next.config.ts`: add `output: "standalone",` to `nextConfig`.

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts: skips husky and the Supabase CLI download; the build needs neither.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
```

`.dockerignore`:

```
.git
.github
.next
node_modules
.claude
.superpowers
.husky
coverage
playwright-report
test-results
e2e
tests
supabase
docs
*.md
.env*
!.env.example
Dockerfile
.dockerignore
```

Note: `.env*` exclusion keeps local secrets out of the build context. `*.md` excludes docs; `next build` does not need them (if the build reads `README.md` or similar, remove that line and report).

- [ ] **Step 3: Build and run**

```bash
docker build -t baumann-demo:local \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_docker_check .
docker run -d --rm --name baumann-demo-check -p 3100:3000 -e SOURCE_COMMIT=local-check baumann-demo:local
sleep 5
curl -s localhost:3100/api/health
curl -sI localhost:3100/ | grep -i x-robots-tag
docker exec baumann-demo-check id -u
docker stop baumann-demo-check
```

Expected: health body `{"commit":"local-check","db":"error"}` (the container cannot reach the host's `127.0.0.1`, so `error` is correct here), header `X-Robots-Tag: noindex, nofollow`, uid `1001`. Record the output.

- [ ] **Step 4: Regression** — `pnpm build && pnpm e2e` → green (standalone output must not break `pnpm start`; if `next start` warns about standalone, follow the docs and note it).

- [ ] **Step 5: Commit** — `git add Dockerfile .dockerignore next.config.ts && git commit -m "build: add standalone docker image"`

---

### Task 8: CI jobs `db` and `deploy`, smoke check (FR-13, FR-14)

**Files:**

- Create: `scripts/smoke-check.mts`, `scripts/smoke-check.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `pnpm db:start`, `pnpm db:test`, `pnpm db:types` (Tasks 2/5), Dockerfile (Task 7), `/api/health` body (Task 6).
- Produces: `isDeployed(body: unknown, expectedCommit: string): boolean`, `hasNoindexHeader(headers: Headers): boolean`; CLI `node scripts/smoke-check.mts <base-url> <commit-sha>`.

- [ ] **Step 1 (test-writer): Write the failing test** — `scripts/smoke-check.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { hasNoindexHeader, isDeployed } from "./smoke-check.mts";

describe("isDeployed (FR-14)", () => {
  it("accepts the expected commit with a reachable database", () => {
    expect(isDeployed({ commit: "abc", db: "ok" }, "abc")).toBe(true);
  });

  it.each([
    ["an older commit", { commit: "old", db: "ok" }],
    ["a database error", { commit: "abc", db: "error" }],
    ["an unknown commit", { commit: "unknown", db: "ok" }],
    ["a malformed body", { status: "ok" }],
    ["null", null],
    ["a string", "ok"],
  ])("rejects %s", (_label, body) => {
    expect(isDeployed(body, "abc")).toBe(false);
  });
});

describe("hasNoindexHeader (FR-14)", () => {
  it("accepts the exact directive regardless of case and spacing", () => {
    expect(
      hasNoindexHeader(new Headers({ "X-Robots-Tag": "NoIndex,  NoFollow" }))
    ).toBe(true);
  });

  it.each([
    ["missing", new Headers()],
    ["noindex only", new Headers({ "X-Robots-Tag": "noindex" })],
  ])("rejects a header that is %s", (_label, headers) => {
    expect(hasNoindexHeader(headers)).toBe(false);
  });
});
```

If TypeScript rejects the `.mts` import extension, add `"allowImportingTsExtensions": true` to `tsconfig.json` (`noEmit` is already set) and note it.

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run scripts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `scripts/smoke-check.mts` (runs with Node 22's built-in type stripping: no enums, no parameter properties):

```ts
// Post-deploy check: waits until the preview runs the expected commit with a
// reachable database, then verifies the noindex header.
// Usage: node scripts/smoke-check.mts <base-url> <commit-sha>
import { pathToFileURL } from "node:url";
import { z } from "zod";

const healthSchema = z.object({
  commit: z.string(),
  db: z.enum(["ok", "error"]),
});

export function isDeployed(body: unknown, expectedCommit: string): boolean {
  const parsed = healthSchema.safeParse(body);
  return (
    parsed.success &&
    parsed.data.commit === expectedCommit &&
    parsed.data.db === "ok"
  );
}

export function hasNoindexHeader(headers: Headers): boolean {
  const value = headers.get("x-robots-tag");
  if (value === null) return false;
  const directives = value
    .toLowerCase()
    .split(",")
    .map((part) => part.trim());
  return directives.includes("noindex") && directives.includes("nofollow");
}

const TIMEOUT_MS = 10 * 60_000;
const INTERVAL_MS = 15_000;

async function main(): Promise<void> {
  const [baseUrl, expectedCommit] = process.argv.slice(2);
  if (!baseUrl || !expectedCommit) {
    console.error(
      "usage: node scripts/smoke-check.mts <base-url> <commit-sha>"
    );
    process.exit(2);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/health", baseUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      const body: unknown = response.ok ? await response.json() : null;
      if (isDeployed(body, expectedCommit)) {
        const home = await fetch(baseUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!hasNoindexHeader(home.headers)) {
          console.error("X-Robots-Tag: noindex, nofollow is missing on /");
          process.exit(1);
        }
        console.log(
          `Deployed ${expectedCommit}: database ok, noindex header present.`
        );
        return;
      }
      console.log(`Waiting for ${expectedCommit}, got ${JSON.stringify(body)}`);
    } catch (error) {
      console.warn(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  console.error(
    `Timed out after ${TIMEOUT_MS / 60_000} minutes waiting for ${expectedCommit}.`
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
```

Then run `node scripts/smoke-check.mts http://127.0.0.1:9 abc` once and confirm it starts polling (prints `Health check failed`), then interrupt with a 20 s timeout: `timeout 20 node scripts/smoke-check.mts http://127.0.0.1:9 abc; echo exit=$?` (on macOS use `gtimeout` if available, else skip and note). This proves Node runs the file without a TS loader.

`.github/workflows/ci.yml` — final shape (keep the existing `app` steps; changes marked):

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

# PR runs may be cancelled by newer pushes; main runs never, so a deploy
# (migration + release) always runs to completion.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  app:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      NEXT_PUBLIC_SITE_URL: http://localhost:3000
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
      GITLEAKS_VERSION: 8.30.1
    steps:
      # … existing steps unchanged (checkout, gitleaks, pnpm, node, install,
      # lint, typegen, typecheck, test, build, playwright cache/install, e2e,
      # report upload) …

      - name: Lint workflows
        run: docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color

      - name: Build Docker image
        run: >
          docker build -t baumann-demo:ci
          --build-arg NEXT_PUBLIC_SITE_URL
          --build-arg NEXT_PUBLIC_SUPABASE_URL
          --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          .

  db:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:start
      - run: pnpm db:test
      - name: Generated types match the migrations
        run: pnpm db:types && git diff --exit-code -- lib/supabase/database.types.ts

  deploy:
    needs: [app, db]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    concurrency:
      group: deploy-preview
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Open SSH tunnel to the database
        env:
          SSH_HOST: ${{ secrets.DEPLOY_SSH_HOST }}
          SSH_USER: ${{ secrets.DEPLOY_SSH_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.DEPLOY_SSH_KNOWN_HOSTS }}
          DB_TUNNEL_TARGET: ${{ secrets.DEPLOY_DB_TUNNEL_TARGET }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh -i ~/.ssh/deploy_key -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
            -fN -L "54329:${DB_TUNNEL_TARGET}" "${SSH_USER}@${SSH_HOST}"

      - name: Apply migrations
        env:
          PROD_DB_URL: ${{ secrets.PROD_DB_URL }}
        run: pnpm exec supabase db push --db-url "$PROD_DB_URL"

      - name: Trigger Coolify deployment
        env:
          COOLIFY_WEBHOOK_URL: ${{ secrets.COOLIFY_WEBHOOK_URL }}
          COOLIFY_TOKEN: ${{ secrets.COOLIFY_TOKEN }}
        run: >
          curl --fail-with-body -sS -X POST "$COOLIFY_WEBHOOK_URL"
          -H "Authorization: Bearer $COOLIFY_TOKEN"

      - name: Smoke check
        env:
          PREVIEW_URL: ${{ secrets.PREVIEW_URL }}
        run: node scripts/smoke-check.mts "$PREVIEW_URL" "$GITHUB_SHA"
```

Notes:

- `PROD_DB_URL` points at the tunnel: `postgresql://postgres:<password>@127.0.0.1:54329/postgres` (percent-encoded password).
- `db push` does not include the seed (no `--include-seed`), so synthetic data never reaches production.
- Coolify's predefined `SOURCE_COMMIT` must equal `GITHUB_SHA` (same commit on `main`); the runbook covers the setting.

- [ ] **Step 4: Verify locally**

```bash
pnpm test
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color
pnpm db:test
pnpm db:types && git diff --exit-code -- lib/supabase/database.types.ts
```

Expected: all exit 0. CI evidence (SC-9, SC-12, SC-13, SC-14) is collected after the developer approves the push at Gate 2.

- [ ] **Step 5: Commit** — `git add scripts .github/workflows/ci.yml tsconfig.json && git commit -m "ci: add database job, deploy job and post-deploy smoke check"`

---

### Task 9: Runbook, ADR 0005 and project docs (FR-15)

**Files:**

- Create: `docs/deploy.md`, `docs/decisions/0005-production-migrations.md`
- Modify: `CLAUDE.md` (Commands section), `docs/decisions/0002-deploy.md` (link to ADR 0005 under Consequences), `docs/data-model.md` (variant rows for products without colours; admin check)

No tests (documentation); reviewed by the code-reviewer and the developer (SC-15).

- [ ] **Step 1: Write `docs/deploy.md`** with these sections (English, no IPs, no real secrets, placeholders like `<vps-host>`):

1. **Overview** — diagram in text: GitHub Actions (`app`, `db` → `deploy`) → SSH tunnel → Postgres; Coolify webhook → build on VPS → container; smoke check.
2. **DNS** — A/AAAA records for `baumann.eugen-moser.com` and `api.baumann.eugen-moser.com` → VPS.
3. **Supabase on Coolify** — New resource → Service → Supabase; domain for the API (Kong) `https://api.baumann.eugen-moser.com`; sign-ups disabled (`DISABLE_SIGNUP=true` / `GOTRUE_DISABLE_SIGNUP=true`, whichever the template uses), no SMTP configured; Studio only behind its basic-auth credentials with a strong password (or not exposed); note which key the template issues (legacy anon JWT is fine, D5); pin the service images and record versions.
4. **Postgres for migrations** — map Postgres (direct `supabase-db` or Supavisor session port, whichever the template exposes) to `127.0.0.1:5432` on the host only. Verify: `ss -tlnp | grep 5432` shows `127.0.0.1`; from another machine `nc -vz <vps-host> 5432` fails.
5. **Deploy user and key** — `ssh-keygen -t ed25519 -f deploy_key -N "" -C github-actions-deploy`; `adduser --disabled-password --gecos "" deploy`; `authorized_keys` line `restrict,port-forwarding,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin" ssh-ed25519 AAAA… github-actions-deploy`; `ssh-keyscan -t ed25519 <vps-host>` for known hosts. Verify: `ssh -i deploy_key deploy@<vps-host>` gets no shell; `ssh -i deploy_key -N -L 54329:127.0.0.1:5432 deploy@<vps-host>` works.
6. **App resource in Coolify** — source: GitHub App, branch `main`, build pack Dockerfile, domain `https://baumann.eugen-moser.com`, port 3000, **Auto Deploy off**; build variables `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (marked as build-time); runtime `SOURCE_COMMIT` is predefined; health check path `/api/health`. Create an API token with deploy permission; copy the deploy webhook URL.
7. **GitHub repository secrets** — table: `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_KNOWN_HOSTS`, `DEPLOY_DB_TUNNEL_TARGET` (`127.0.0.1:5432`), `PROD_DB_URL`, `COOLIFY_WEBHOOK_URL`, `COOLIFY_TOKEN`, `PREVIEW_URL` — what each holds, where it comes from. Repository secrets, because environments need a paid plan for private repos.
8. **First deploy and verification** — after merge: watch the `deploy` job; evidence for SC-14/SC-15 (job log, `curl -s https://baumann.eugen-moser.com/api/health`, `nc` result, no-shell result).
9. **Migrations** — expand/contract rule (D7): migrations must work with the currently running app; destructive changes in a later release. Failed migration → app is not redeployed; fix forward with a new migration.
10. **Backups and restore** — Coolify scheduled backup for the Supabase database (daily, keep 7) to off-site S3-compatible storage if available; otherwise a cron `pg_dump` via `docker exec` into a rotated directory plus off-site copy. Storage files (volume of the storage service) are backed up too. Quarterly restore test into the local stack (`supabase db reset` + `psql < dump`), documented with date.
11. **Updates** — Coolify self-updates; Supabase service images pinned, updated deliberately (read changelog, test the CLI version locally first); app dependencies via PR.
12. **VPS size check** — after the stack is up: record `free -h`, `docker stats --no-stream`, and the peak during an app build. Threshold: if available memory drops below 1 GB during a build, switch to building in GitHub Actions and pushing to GHCR (ADR 0002 fallback).

- [ ] **Step 2: Write `docs/decisions/0005-production-migrations.md`** — same format as ADR 0001–0004: Status accepted (2026-10-05), Feature 2; Context (migrations must reach the self-hosted DB without exposing Postgres); Decision (D7: CI-only `supabase db push` through an SSH tunnel with a key restricted to port forwarding, before the Coolify webhook; expand/contract); Alternatives (manual push — drift; public port with IP allowlist — GitHub runner IPs change; migrations at container start — app needs DB superuser credentials); Consequences (+ single path, auditable in CI logs; − SSH key in GitHub secrets, mitigated by `restrict,permitopen`; − migrations run before the app switches).

- [ ] **Step 3: Update `CLAUDE.md` Commands** — add:

```
- Local Supabase: `pnpm db:start` / `pnpm db:stop` (Docker required)
- Reset local DB (migrations + seed): `pnpm db:reset`
- DB tests (pgTAP + integration, stack must run): `pnpm db:test`
- Regenerate DB types: `pnpm db:types`
```

and under Structure: `supabase/` — migrations, seed, pgTAP tests; `docs/deploy.md` — runbook. Do not change the Status line (done after Gate 2).

- [ ] **Step 4: Update `docs/data-model.md`** — under "View `variant`": "Products without colours yield one row with the bare article number." Under "Access rules (RLS)": "Admin = JWT `app_metadata.role = 'admin'`, checked by `private.is_admin()`. Children of a product are visible when the product is visible to the caller." Under Storage: bucket `catalog`, files served by public URL, listing admin-only. Also add to `CLAUDE.md` → "Pitfalls & open issues": "Default privileges on `public` are revoked for `anon`/`authenticated`: every new table needs explicit grants, RLS enabled and admin write policies in its migration (the RLS pgTAP test fails otherwise)."

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write docs CLAUDE.md
git add docs CLAUDE.md
git commit -m "docs: add deploy runbook and adr for production migrations"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full local run** (stack running), each command separately with its exit code in the report:

```bash
pnpm typecheck; echo "typecheck exit=$?"
pnpm lint; echo "lint exit=$?"
pnpm test; echo "test exit=$?"
pnpm db:reset; echo "db:reset exit=$?"
pnpm db:test; echo "db:test exit=$?"
pnpm build; echo "build exit=$?"
pnpm e2e; echo "e2e exit=$?"
pnpm db:types && git diff --exit-code -- lib/supabase/database.types.ts; echo "types drift exit=$?"
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color; echo "actionlint exit=$?"
```

(`pnpm build` needs the three public env values; use `.env.local` or inline them as in Task 1.)

- [ ] **Step 2: SC mapping** — table SC-1 … SC-15 → test file / evidence / "after merge" (SC-13 broken-policy check, SC-14, SC-15 and the CI parts of SC-9/SC-12 are collected after the push is approved).

- [ ] **Step 3: Secret scan** — `gitleaks git --redact --no-banner -v .` (if installed) → no leaks.

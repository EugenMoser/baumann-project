# AI Text Assistant (Feature 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors get AI suggestions for a product's description, SEO title and SEO description, accept or discard each, and the saved origin drives the AI label.

**Architecture:** A pure core in `lib/ai/` (input, checks, prompt, chain, limits, generation service) that both a Route Handler and a CLI import; providers are adapters behind one `Tier` interface (OpenRouter via the AI SDK, Anthropic via the official SDK, a fake for tests). A new `ai_request` table with a reserving database function enforces the limits; the existing product save learns accepted suggestion ids.

**Tech Stack:** Next.js 16.3 Route Handler, React 19.2, TypeScript strict, Zod 4, Supabase (Postgres, RLS, pgTAP), `ai` 7, `@openrouter/ai-sdk-provider` 3, `@anthropic-ai/sdk` 1, Vitest, Playwright.

**Spec:** `docs/specs/2026-11-01-ai-text-assistant-design.md` (D1–D11, FR-1–FR-12, SC-1–SC-12). Read it before your task; values below are copied from it.

## Global Constraints

- Package manager pnpm 10; never `npm install`.
- Exact pins: `ai@7.0.155`, `@openrouter/ai-sdk-provider@3.1.0`, `@anthropic-ai/sdk@1.3.0`.
- `lib/ai/**` except `lib/ai/server.ts` uses relative imports **with** `.ts` extensions, no `@/` alias, no `server-only`, no `lib/env` import, erasable TypeScript only (no enums, namespaces, parameter properties) — `scripts/ai/try.mts` imports it under Node's type stripping.
- Keys and AI calls are server-side only; provider error texts and keys never reach the client or logs.
- UI copy is German and exactly as in the spec (D1, D5, error table). AI features and AI text are labelled.
- New tables need explicit grants, RLS and admin policies in their migration.
- Tests never call real providers; E2E uses `AI_FAKE_MODEL=1` on the local stack. Tests never run against the preview database.
- Read `node_modules/next/dist/docs/` before writing Route Handler or form code; check AI SDK 7 usage with Context7 (`npx ctx7@latest docs /websites/ai-sdk_dev "<topic>"`).
- Model ids: default fallback `claude-haiku-5-5`; never append date suffixes.
- Commit after each task with a Conventional Commit message (WIP commits on the feature branch are allowed).

## Review Focus

1. A saved product without articles or colours: input is still valid, the number check passes a text without numbers, suggestions work (Task 4, Task 3).
2. Saving with a validation error after "Übernehmen": the hidden ids survive the error round trip, the next successful save still sets the AI origin (Task 9).
3. Product status changed between generation and save, or the suggestion row belongs to another product: the id is ignored, origin falls back to the current rule (Task 8).
4. A provider answers with Markdown-fenced JSON, extra prose or extra keys: the tier fails cleanly and the chain moves on, no exception escapes (Task 6).
5. Session expired during a pending suggestion: the handler answers 401 JSON, the editor shows "Bitte neu anmelden." instead of a crash (Task 7, Task 9).

---

### Task 1: Follow-ups from 6c (D11)

**Model:** Sonnet · **Effort:** medium

**Files:**

- Test: `lib/admin/products.test.ts` (create if missing), `lib/admin/categories.test.ts` (create if missing)
- Modify: `docs/plans/2026-10-28-product-images-selection.md:11`

**Interfaces:** Consumes `saveProduct(client, id, input)` (`lib/admin/products.ts:314`), `saveCategory` (`lib/admin/categories.ts:95`), `withSlugRetry` (`lib/admin/slugs.ts:44`).

- [ ] **Step 1: Write the tests** `retries the product insert with a new slug after a concurrent unique violation` and `retries the category save with a new slug after a concurrent unique violation`: fake client whose first insert/RPC returns `{ code: "23505", message: …<slug constraint name>… }` and second succeeds; assert two reads of taken slugs, the second write carries `<base>-2`, result `ok`. Reuse the fake-client style of `lib/admin/slugs.test.ts`.
- [ ] **Step 2: Run** `pnpm vitest run lib/admin/products.test.ts lib/admin/categories.test.ts` — expected PASS (behaviour exists; these pin it). If a test fails, the code is wrong: report, do not weaken the test.
- [ ] **Step 3: Replace the absolute path** on line 11 of the 4b plan with the repo-relative spec path only.
- [ ] **Step 4: Verify** `grep -n "/Users/" docs/plans/*.md docs/specs/*.md` prints nothing.
- [ ] **Step 5: Commit** `test: pin slug retry through product and category saves`.

### Task 2: Dependencies and AI settings (D9)

**Model:** Sonnet · **Effort:** high

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `lib/ai/settings.ts`, `lib/ai/settings.test.ts`
- Modify: `lib/env/server.ts`

**Interfaces:**

- Produces:
  ```ts
  export type AiSettings = {
    openRouterKey: string | null;
    freeModels: string[]; // trimmed, empty entries dropped, order kept
    anthropicKey: string | null;
    fallbackModel: string; // default "claude-haiku-5-5"
    monthlyCap: number; // default 200, int >= 0
    hourlyLimit: number; // default 20, int >= 0
    fake: boolean; // AI_FAKE_MODEL === "1"
  };
  export function parseAiSettings(
    source: Record<string, string | undefined>
  ): AiSettings; // throws "Invalid environment variables:\n…" like lib/env/schema.ts
  export type AiAvailability = "none" | "free_only" | "full";
  export function availability(s: AiSettings): AiAvailability;
  // "full": fake, or anthropicKey set; "free_only": openRouterKey and freeModels.length > 0 but no anthropicKey; else "none"
  ```
- `lib/env/server.ts` exports `aiSettings: AiSettings = parseAiSettings({...})` with the D9 variables plus `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1: Install** `pnpm add --save-exact ai@7.0.155 @openrouter/ai-sdk-provider@3.1.0 @anthropic-ai/sdk@1.3.0`; `pnpm build` still compiles.
- [ ] **Step 2: Write failing tests** in `settings.test.ts`: defaults (`fallbackModel` `claude-haiku-5-5`, caps 200/20, `freeModels` `[]`); `AI_FREE_MODELS=" a:free , ,b:free"` → `["a:free","b:free"]`; non-integer or negative cap throws; `AI_FAKE_MODEL=1` with `NEXT_PUBLIC_SITE_URL=https://baumann.example` throws, with `http://localhost:3000` and `http://127.0.0.1:3000` passes; `availability` for none / free_only / full / fake.
- [ ] **Step 3: Run** `pnpm vitest run lib/ai/settings.test.ts` — FAIL (module missing).
- [ ] **Step 4: Implement** with a Zod object + `superRefine` for the fake guard.
- [ ] **Step 5: Run** the test — PASS; `pnpm typecheck` exit 0.
- [ ] **Step 6: Commit** `feat(ai): add AI dependencies and settings`.

### Task 3: Output schema, checks and prompt (D3, D8)

**Model:** Sonnet · **Effort:** high

**Files:**

- Create: `lib/ai/product-copy/schema.ts`, `checks.ts`, `checks.test.ts`, `prompt.ts`, `prompt.test.ts`

**Interfaces:**

- Produces:
  ```ts
  // schema.ts
  export const copySchema: z.ZodObject<{
    description: z.ZodString;
    seoTitle: z.ZodString;
    seoDescription: z.ZodString;
  }>;
  export type CopyDraft = z.infer<typeof copySchema>;
  // checks.ts
  export type CheckFailure =
    "shape" | "length" | "ending" | "form" | "script" | "numbers";
  export function numbersIn(text: string): string[]; // "15,5", "8", "2,0" normalised: decimal comma kept, thousands separators removed
  export function checkCopy(
    raw: unknown,
    inputNumbers: ReadonlySet<string>
  ):
    | { ok: true; value: CopyDraft }
    | { ok: false; failure: CheckFailure; field?: keyof CopyDraft };
  // prompt.ts
  export const PROMPT_VERSION = "product-copy-v1";
  export const SYSTEM_PROMPT: string; // German, D8 rules
  export function userMessage(input: unknown): string; // the JSON block only
  ```

D3 limits (exact): description 80–700 characters; `seoTitle` ≤ 60; `seoDescription` ≤ 155; a value exactly at a maximum (700 / 60 / 155) fails `length`. Endings: description and `seoDescription` end with `.`, `!` or `?`; `seoTitle` does not end with `-`, `,`, `:` or `–`. Form: no line starting with `-`, `*`, `•`, `#` or `\d+\.`, no `**`, `__`, `[`…`](`. Script: Latin letters incl. umlauts/ß, digits, whitespace, punctuation and `– „ “ ‚ ‘ × ° ± ⌀ / % ( )`; anything else fails. Numbers: every element of `numbersIn(field)` must be in `inputNumbers`.

- [ ] **Step 1: Write failing tests** — one passing and one failing case per rule, plus the ADR 0004 cases, each failing with the named failure: `seoDescription` of exactly 155 characters (`length`); "Sechs Höhen von 8–15 mm." with inputs `{"8","15,5"}` (`numbers`); a description with a `- ` bullet line (`form`); a description containing `你` (`script`); a 60-character `seoTitle` ending mid-word (`length`); a text without numbers and an empty number set passes (Review Focus 1). Prompt tests: `SYSTEM_PROMPT` contains "nur Fakten", "keine Preise", "keine Superlative", "250–600 Zeichen", "55 Zeichen", "140 Zeichen", and mentions Wohnwagen/Reisemobil manufacturers; `userMessage({a:1})` equals the JSON block with no extra instructions.
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/product-copy` — FAIL.
- [ ] **Step 3: Implement.** `numbersIn` matches `\d+(?:[.,]\d+)?` after removing `.` thousands separators in 4+ digit groups; ranges like "8–15" yield `["8","15"]`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ai): add output checks and product copy prompt`.

### Task 4: Input from the saved product (D2)

**Model:** Sonnet · **Effort:** medium

**Files:**

- Create: `lib/ai/product-copy/input.ts`, `input.test.ts`

**Interfaces:**

- Consumes: `numbersIn` (Task 3).
- Produces:

  ```ts
  export type CopySource = {
    productId: number;
    status: "draft" | "published" | "archived";
    category: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    material: { code: string; name: string } | null;
    materialNote: string | null;
    articles: {
      number: string;
      name: string | null;
      description: string | null;
      note: string | null;
      material: { code: string; name: string } | null;
      materialNote: string | null;
      attributes: {
        label: string;
        value: string | number;
        unit: string | null;
      }[];
      packaging: { quantity: number; label: string | null }[];
    }[];
    colors: { name: string; isDefault: boolean }[];
  };
  // Keys are German because the JSON block goes to a German prompt.
  // Materials are formatted "code – name"; attribute values are strings with a
  // decimal comma ("15,5") so the number check sees the same form as the text.
  export type CopyInput = {
    kategorie: string;
    produkt: string;
    untertitel: string | null;
    material: string | null;
    materialhinweis: string | null;
    anzahlArtikel: number;
    anzahlFarben: number;
    artikel: {
      nummer: string;
      name: string | null;
      beschreibung: string | null;
      hinweis: string | null;
      material: string | null;
      materialhinweis: string | null;
      merkmale: { name: string; wert: string; einheit: string | null }[];
      verpackung: { menge: number; bezeichnung: string | null }[];
    }[];
    farben: { name: string; standard: boolean }[];
    bisherigeBeschreibung: string | null;
  };
  export function loadCopySource(
    client: SupabaseClient<Database>,
    productId: number
  ): Promise<
    | { ok: true; value: CopySource }
    | { ok: false; error: "not_found" | "db_error" }
  >;
  export function buildCopyInput(source: CopySource): CopyInput; // article material = own ?? product's
  export function inputNumbers(input: CopyInput): Set<string>; // numbersIn over every string/number value
  ```

  `Database` type via `import type { Database } from "../../supabase/database.types.ts"`.

- [ ] **Step 1: Write failing tests** `buildCopyInput`: includes exactly the D2 fields (keys of `CopyInput`), counts, article material fallback to the product material, `bisherigeBeschreibung` null for an empty description; contains no `productId`, `status`, storage paths; product without articles/colours gives `anzahlArtikel: 0`, empty arrays (Review Focus 1). `inputNumbers` contains `"15,5"` from an attribute value 15.5 (formatted with decimal comma) and the counts. `loadCopySource` with a fake client returning one product row: maps fields; missing row → `not_found`.
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/product-copy/input.test.ts` — FAIL.
- [ ] **Step 3: Implement** `loadCopySource` as one select on `product` with `category(name)`, `material(code,name)`, `article(…, material(…), article_attribute(value_*, attribute(label, unit, data_type)), article_packaging(quantity,label))`, `product_color(is_default, sort_order, color(name))`; read the column names from `supabase/migrations/20261005090100_catalog_tables.sql` and the attribute value columns from `lib/catalog/product.ts`. Order articles and colours by `sort_order`.
- [ ] **Step 4: Run** — PASS; `pnpm typecheck` exit 0.
- [ ] **Step 5: Commit** `feat(ai): build the product copy input from saved data`.

### Task 5: Request log, reservation and cleanup (D7)

**Model:** Opus · **Effort:** high

**Files:**

- Create: `supabase/migrations/20261103090000_ai_requests.sql`, `supabase/tests/13_ai_requests.test.sql`, `tests/integration/ai-request.test.ts`, `lib/ai/limits.ts`, `lib/ai/limits.test.ts`
- Modify: `lib/supabase/database.types.ts` (via `pnpm db:types`), `supabase/tests/01_schema.test.sql` / `04_rls.test.sql` if they enumerate tables

**Interfaces:**

- SQL:
  - `public.ai_request(id bigint identity pk, product_id bigint references product(id) on delete set null, requested_by uuid not null, status text not null default 'started' check (status in ('started','succeeded','failed')), model text, input_tokens int, output_tokens int, created_at timestamptz not null default now())`, index on `(created_at)` and `(requested_by, created_at)`.
  - `alter table public.ai_generation add column request_id bigint references public.ai_request(id) on delete cascade`.
  - Grants select/insert/update to `authenticated`, RLS enabled, policies admin select/insert/update (`private.is_admin()`), no anon access.
  - `public.reserve_ai_request(p_product_id bigint, p_monthly_cap int, p_hourly_limit int) returns bigint`, `security invoker`, `set search_path = ''`: `pg_advisory_xact_lock(hashtext('ai_request'))`; count rows with `created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'`; if `>= p_monthly_cap` raise `using errcode = 'AI001'`; count rows of `auth.uid()` in the last hour; if `>= p_hourly_limit` raise `using errcode = 'AI002'`; insert with `requested_by = auth.uid()`, return id. Execute granted to `authenticated` only.
  - Redefine `remove_catalog()` from its latest definition (today `supabase/migrations/20261011090000_certificates.sql`; check no later migration redefines it) adding `delete from public.ai_request where true;` after `ai_generation`, keeping every existing statement.
- TS (`lib/ai/limits.ts`):

  ```ts
  export type LimitError = "monthly_cap" | "hourly_limit" | "db_error";
  export function reserveRequest(
    client: SupabaseClient<Database>,
    productId: number,
    s: Pick<AiSettings, "monthlyCap" | "hourlyLimit">
  ): Promise<{ ok: true; value: number } | { ok: false; error: LimitError }>; // AI001 → monthly_cap, AI002 → hourly_limit
  export function finishRequest(
    client: SupabaseClient<Database>,
    id: number,
    outcome: {
      status: "succeeded" | "failed";
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
    }
  ): Promise<void>; // logs, never throws
  ```

- [ ] **Step 1: Write failing pgTAP tests** (`13_ai_requests.test.sql`): table and column exist; RLS enabled; anon selects 0 rows and cannot insert; admin can reserve; with cap 2 the third reservation raises `AI001`; hourly limit 1 raises `AI002` for the same user but not for another admin; a non-admin `authenticated` user cannot reserve (RLS insert denied); `remove_catalog()` leaves `ai_request` empty. Follow the auth-switching helpers in `supabase/tests/11_admin.test.sql`.
- [ ] **Step 2: Write the failing integration test** `two parallel reservations at limit - 1 yield one id and one monthly_cap` (`tests/integration/ai-request.test.ts`, two admin sessions or one session twice via `Promise.all`, cap = existing rows + 1). Unit tests for `reserveRequest` error mapping with a fake client.
- [ ] **Step 3: Run** `pnpm db:reset && pnpm db:test` and `pnpm vitest run lib/ai/limits.test.ts` — FAIL.
- [ ] **Step 4: Implement** the migration, `pnpm db:types`, then `limits.ts`.
- [ ] **Step 5: Run** `pnpm db:reset && pnpm db:test` — exit 0; unit test PASS.
- [ ] **Step 6: Commit** `feat(db): log AI requests and enforce the monthly and hourly limits`.

### Task 6: Model chain and providers (D4, D9 fake)

**Model:** Sonnet · **Effort:** high

**Files:**

- Create: `lib/ai/chain.ts`, `chain.test.ts`, `lib/ai/providers.ts`, `providers.test.ts`

**Interfaces:**

- Consumes: `AiSettings` (Task 2), `copySchema`, `checkCopy`, `SYSTEM_PROMPT`, `userMessage` (Task 3), `CopyInput`, `inputNumbers` (Task 4).
- Produces:
  ```ts
  export type TierAnswer = {
    raw: unknown;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  export type Tier = {
    kind: "free" | "anthropic" | "fake";
    model: string;
    timeoutMs: number;
    call(input: CopyInput, signal: AbortSignal): Promise<TierAnswer>;
  }; // throws on HTTP/timeout/empty
  export type ChainSuccess = {
    draft: CopyDraft;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  export type ChainFailure = {
    attempts: { model: string; reason: "error" | "timeout" | CheckFailure }[];
  };
  export function runChain(
    input: CopyInput,
    published: boolean,
    tiers: Tier[]
  ): Promise<
    { ok: true; value: ChainSuccess } | { ok: false; error: ChainFailure }
  >;
  export function tiersFor(s: AiSettings): Tier[]; // fake only when s.fake; else up to 2 free tiers (25_000 ms) then anthropic (30_000 ms)
  ```
- Free tier: `generateText({ model: createOpenRouter({ apiKey })(id), system: SYSTEM_PROMPT, prompt: userMessage(input), output: Output.object({ schema: copySchema }), maxRetries: 0, abortSignal })`; `raw` = `output`.
- Anthropic tier: `new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 })`, `client.messages.parse({ model, max_tokens: 2000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userMessage(input) }], output_config: { effort: "low", format: zodOutputFormat(copySchema) } }, { signal })` from `@anthropic-ai/sdk/helpers/zod`; `raw` = `parsed_output` (null → throw), tokens from `usage`. Catch the SDK's typed errors (`Anthropic.APIError` and subclasses), never match message strings.
- Fake tier: waits 1500 ms, returns a draft built from `input.produkt` and `input.untertitel` with no numbers, which passes `checkCopy` (e.g. description "Testvorschlag für {produkt}. Der Text stammt vom Testmodell und enthält nur Angaben aus den Produktdaten."), model `"fake"`.

- [ ] **Step 1: Write failing tests** (`chain.test.ts`, in-memory tiers): published tries free tiers in order and stops at the first valid output; 429-like throw, timeout (tier never resolves, `timeoutMs` 20 in the test) and empty answer move on; a D3 failure moves on and is recorded with its `CheckFailure`; a draft and an archived product skip free tiers; never more than two free tiers even with three configured; all failing → `ok: false` with every attempt; a tier answering Markdown-fenced JSON or extra keys fails as `shape`, no exception escapes (Review Focus 4). `providers.test.ts`: `tiersFor` order, timeouts and the fake-only case; the fake draft passes `checkCopy` with an empty number set.
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/chain.test.ts lib/ai/providers.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Timeouts via `AbortSignal.timeout(tier.timeoutMs)` combined with `Promise.race` so a tier that ignores the signal still times out.
- [ ] **Step 4: Run** — PASS; `pnpm typecheck` exit 0.
- [ ] **Step 5: Commit** `feat(ai): add the model chain with free, Anthropic and fake tiers`.

### Task 7: Generation service and Route Handler (D1, D6 audit rows)

**Model:** Opus · **Effort:** high

**Files:**

- Create: `lib/ai/generate.ts`, `generate.test.ts`, `lib/ai/server.ts`, `app/admin/(protected)/produkte/[id]/ki-vorschlag/route.ts`, `app/admin/(protected)/produkte/[id]/ki-vorschlag/route.test.ts`, `lib/ai/messages.ts`

**Interfaces:**

- Consumes: Tasks 2–6.
- Produces:
  ```ts
  // generate.ts
  export type Suggestion = {
    field: "description" | "seo_title" | "seo_description";
    generationId: number;
    text: string;
  };
  export type GenerateError =
    | "not_found"
    | "monthly_cap"
    | "hourly_limit"
    | "not_set_up"
    | "draft_needs_fallback"
    | "failed"
    | "db_error";
  export function generateCopy(
    deps: {
      client: SupabaseClient<Database>;
      settings: AiSettings;
      tiers: Tier[];
    },
    productId: number
  ): Promise<
    | { ok: true; value: { model: string; suggestions: Suggestion[] } }
    | { ok: false; error: GenerateError }
  >;
  // messages.ts — German texts, exact from the spec error table
  export const GENERATE_MESSAGES: Record<
    GenerateError | "unauthorized" | "forbidden" | "bad_request",
    string
  >;
  // route.ts
  export async function POST(
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ): Promise<Response>;
  // 200 { model, suggestions } | 4xx/5xx { error: string } with GENERATE_MESSAGES text
  ```
- `generateCopy` order: availability `none` → `not_set_up`; load source (`not_found`); draft/archived with `free_only` → `draft_needs_fallback`; reserve (limit errors); run chain; on success insert three `ai_generation` rows (`entity 'product'`, `entity_id`, `field`, `model`, `prompt_version` = `PROMPT_VERSION`, `output`, `request_id`) and `finishRequest(succeeded…)`; on chain failure `finishRequest(failed…)` → `failed`. No write to `product`.
- Route: `createSessionSupabase()` + `checkAdmin()` (anonymous → 401 `unauthorized` "Bitte neu anmelden.", forbidden → 403); `Origin` must equal `new URL(publicEnv.NEXT_PUBLIC_SITE_URL).origin` and `Content-Type` must start with `application/json`, else 403/415 `bad_request` "Ungültige Anfrage."; body `{}` ignored; id from params must be a positive integer. HTTP codes: not_found 404, limits 429, not_set_up/draft_needs_fallback 409, failed 502, db_error 500. Log `[ai] generate failed` with the error kind only.
- `lib/ai/server.ts` (`import "server-only"`): `export function generationDeps(client): …` wiring `aiSettings` and `tiersFor(aiSettings)`.

- [ ] **Step 1: Write failing tests** `generate.test.ts` (fake client + in-memory tiers): each `GenerateError` path; success writes exactly three rows with the prompt version and request id and marks the request `succeeded`; failure marks it `failed`; `product` is never updated. `route.test.ts` (mock `checkAdmin`, `createSessionSupabase`, `generateCopy`): non-admin 401/403 and foreign `Origin` and `text/plain` body each return without calling `generateCopy` (SC-1); success returns 200 JSON; an expired session returns 401 with "Bitte neu anmelden." (Review Focus 5).
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/generate.test.ts "app/admin/(protected)/produkte/[id]/ki-vorschlag"` — FAIL.
- [ ] **Step 3: Implement.** Check how `proxy.ts` treats `/admin/**` POSTs without a session; the handler must still answer JSON when reached.
- [ ] **Step 4: Run** — PASS; `pnpm typecheck && pnpm lint` exit 0.
- [ ] **Step 5: Commit** `feat(ai): add the suggestion route for the product editor`.

### Task 8: Origin with accepted suggestions (D6)

**Model:** Sonnet · **Effort:** high

**Files:**

- Modify: `lib/admin/origin.ts`, `lib/admin/origin.test.ts`, `lib/admin/products.ts`, `lib/admin/schemas.ts`, `app/admin/(protected)/produkte/actions.ts`
- Test: `lib/admin/products.test.ts`, `tests/integration/ai-accept.test.ts`

**Interfaces:**

- Produces:
  ```ts
  // origin.ts
  export type AcceptedText = {
    description?: string;
    seoTitle?: string;
    seoDescription?: string;
  }; // outputs of valid accepted rows
  export function productOrigins(
    prev: OriginSource | null,
    next: OriginFields,
    accepted?: AcceptedText
  ): { description_origin: ContentOrigin; seo_origin: ContentOrigin };
  // products.ts
  export type AcceptedIds = {
    description: number | null;
    seoTitle: number | null;
    seoDescription: number | null;
  };
  export async function saveProduct(
    client,
    id,
    input,
    accepted?: AcceptedIds
  ): Promise<Result<{ id: number }, AdminError>>;
  ```
- Form fields `aiDescription`, `aiSeoTitle`, `aiSeoDescription` (hidden; positive integer or empty). Not part of `PRODUCT_FIELDS`; the action reads them with `idFrom(formData, name)` and passes `AcceptedIds`.
- Rules (exact, D6): a row counts only if `entity = 'product'`, `entity_id = id`, `field` matches, `created_at > now() - 24 h`, `accepted_at is null`; otherwise ignore and `console.warn("[admin] ignored AI suggestion id", field)`. Description: accepted → `ai` if saved text === output, else `ai_edited`. SEO: ≥ 1 accepted SEO row → `ai` if every non-empty SEO field equals its accepted output, else `ai_edited`. A field saved empty → `human` (both SEO fields empty for `seo_origin`). No accepted row → current `nextOrigin` rule. Valid rows get `accepted_at = now()` right after the successful product update. On create (`id === null`) ids are ignored.

- [ ] **Step 1: Write failing tests** in `origin.test.ts`: accepted-unchanged → `ai`; accepted-then-edited → `ai_edited`; only `seoTitle` accepted, `seoDescription` human text → `ai_edited`; only `seoTitle` accepted, `seoDescription` empty → `ai`; emptied description → `human`; no accepted → existing cases unchanged. In `products.test.ts`: foreign product id, wrong field, stale (25 h), reused (`accepted_at` set) rows are ignored (Review Focus 3); valid rows are marked accepted after the update. Integration (`tests/integration/ai-accept.test.ts`, local stack): insert an `ai_generation` row, save with its id → `description_origin = 'ai'` and `accepted_at` set.
- [ ] **Step 2: Run** `pnpm vitest run lib/admin/origin.test.ts lib/admin/products.test.ts` and `pnpm db:test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; existing admin tests still PASS (`pnpm test`).
- [ ] **Step 5: Commit** `feat(admin): set the AI origin from accepted suggestions`.

### Task 9: Editor UI (D1, D5)

**Model:** Sonnet · **Effort:** high

**Files:**

- Create: `components/admin/ai-suggest.tsx`, `components/admin/ai-suggest.test.tsx`, `components/admin/origin-badge.tsx`
- Modify: `components/admin/product-form.tsx`, `components/admin/seo-section.tsx`, `app/admin/(protected)/produkte/[id]/page.tsx`, the create page hint (`components/admin/product-form.tsx:72-74`), related tests

**Interfaces:**

- Consumes: route from Task 7 (`POST /admin/produkte/{id}/ki-vorschlag`, JSON), `AiAvailability` (Task 2, passed from the server page as a prop), `aiLabelText` (`lib/catalog/ai-label.ts`).
- Produces: `ProductForm` gains props `ai: { availability: AiAvailability; status: ProductStatus } | null` (null on create) and `origins: { description: ContentOrigin; seo: ContentOrigin }`.
- Copy (exact): button "Mit KI vorschlagen" with a visible "KI" marker; hint "Grundlage ist der zuletzt gespeicherte Stand. Vorschläge werden erst mit „Speichern“ übernommen."; pending "Vorschlag wird erstellt …"; box heading "KI-Vorschlag"; buttons "Übernehmen", "Verwerfen"; disabled hints "Der KI-Assistent ist nicht eingerichtet." / "Für Entwürfe ist kein Modell eingerichtet." (draft or archived with `free_only`); create status hint "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten Speichern."; errors from the response `error` field.
- Behaviour: `fetch` with `Content-Type: application/json`, not a Server Action, so "Speichern" stays usable while pending. Description, `seoTitle`, `seoDescription` become controlled. "Übernehmen" sets the field, sets the hidden `ai…` id, removes the box, focuses the field. "Verwerfen" removes the box and focuses the next open box's "Übernehmen" or the button. A new result replaces open boxes. The SEO `<details>` opens when an SEO box appears. Hidden ids and field values survive a save with validation errors (Review Focus 2) and are cleared after a successful save. Live region (polite) announces "Vorschlag wird erstellt …" and "Drei Vorschläge bereit." or the error. `OriginBadge` shows `aiLabelText(origin)` next to "Beschreibung (Markdown)" and in the SEO summary; nothing for `human`.

- [ ] **Step 1: Write failing tests** (`ai-suggest.test.tsx` and form tests, `fetch` mocked): button and hint render for a saved product, absent on create, create hint text; disabled states for `none` and draft + `free_only`; pending text and live-region texts; three boxes after a response; accept fills the field, sets the hidden id, focuses the field; discard leaves the field unchanged and moves focus per D5; SEO section opens; 401 response shows "Bitte neu anmelden." (Review Focus 5); badges show the public wording; a form state with errors keeps the hidden ids.
- [ ] **Step 2: Run** `pnpm vitest run components/admin` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `pnpm typecheck && pnpm lint` exit 0.
- [ ] **Step 5: Commit** `feat(admin): show AI suggestions in the product editor`.

### Task 10: CLI `pnpm ai:try` (D10)

**Model:** Sonnet · **Effort:** medium

**Files:**

- Create: `scripts/ai/try.mts`, `scripts/ai/try.test.ts`
- Modify: `package.json` (`"ai:try": "node --env-file-if-exists=.env.local scripts/ai/try.mts"`)

**Interfaces:**

- Consumes: `parseAiSettings`, `tiersFor`, `loadCopySource`, `buildCopyInput`, `inputNumbers`, `runChain`, `checkCopy`.
- Produces: `export function parseTryArgs(argv: string[]): { productId: number; model: string | null; allowRemote: boolean } | { error: string }` and `export async function runTry(io: CliIo, env: Record<string,string|undefined>, argv: string[], deps?): Promise<number>` (exit code). Usage "usage: pnpm ai:try --product <id> [--model <id>] [--allow-remote]".
- Behaviour: Supabase URL from `NEXT_PUBLIC_SUPABASE_URL`; non-local host (`127.0.0.1`, `localhost` like `scripts/import/cli.mts:32`) without `--allow-remote` → refuse, exit 2; remote reads with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (published products only), local with `SUPABASE_SERVICE_ROLE_KEY`; `--model` restricts the chain to that one model (free id or the Anthropic id); prints per attempt model, latency in ms and result (`ok` or the failure), then the three texts; writes nothing (no reservation, no `ai_generation`).

- [ ] **Step 1: Write failing tests**: argument parsing (missing/invalid id, unknown flag); remote URL without `--allow-remote` exits 2 and creates no client; remote uses the publishable key, local the service-role key; with fake tiers the output lists attempts and texts; no insert/update/rpc is called on the client.
- [ ] **Step 2: Run** `pnpm vitest run scripts/ai` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `node scripts/ai/try.mts` prints the usage and exits 2 (proves the Node import constraint).
- [ ] **Step 5: Commit** `feat(ai): add the ai:try CLI`.

### Task 11: E2E with the fake model (SC-1, SC-5, SC-6)

**Model:** Sonnet · **Effort:** high

**Files:**

- Create: `e2e/admin/ai-assistant.spec.ts`
- Modify: `playwright.config.ts` (`webServer.env` adds `AI_FAKE_MODEL: "1"`), `e2e/admin/support.ts` if helpers are needed

**Interfaces:** Consumes the UI from Task 9 and the fake tier from Task 6 (1500 ms delay, model `fake`).

- [ ] **Step 1: Write the specs** (local stack, seeded product, logged-in admin project): click "Mit KI vorschlagen" → three "KI-Vorschlag" boxes; while pending, change the subtitle and click "Speichern" → "Gespeichert." appears before the boxes (SC-1); accept description and SEO title, save → public product page shows "KI-generiert" next to the description and the SEO title as `<title>` (SC-5); accept description, edit one word, save → public page shows "KI-unterstützt, redaktionell bearbeitet" (SC-6); "Verwerfen" leaves the description unchanged. Restore the seeded texts in `afterEach` or use a product the teardown removes.
- [ ] **Step 2: Build and run** per CLAUDE.md: `pnpm db:start && pnpm db:reset`, build with the local `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, then `pnpm e2e` — the new specs PASS and the existing suite stays green.
- [ ] **Step 3: Commit** `test(e2e): cover the AI assistant with the fake model`.

### Task 12: Live trial, ADR amendment and docs (D4, D10, FR-12)

**Model:** Sonnet · **Effort:** medium

**Files:**

- Modify: `docs/decisions/0004-ai-provider.md`, `docs/data-model.md`, `docs/deploy.md`, `docs/revocation.md`, `CLAUDE.md` (Commands only; status is set by `/abschluss`)

- [ ] **Step 1: List free candidates** from `https://openrouter.ai/api/v1/models` (`:free` ids with `structured_outputs` in `supported_parameters`), at most four.
- [ ] **Step 2: Live trial** (user decision D10; the keys are in the main checkout's `.env.local`, whose absolute path the controller passes in the task prompt — never write it into a committed file): `node --env-file=<main checkout>/.env.local scripts/ai/try.mts --product <id> --allow-remote [--model <id>]` for three published products of the preview database (pick ids via the public search or category pages) with each candidate and with `claude-haiku-5-5`; then one seeded draft on the local stack with local env overrides (shell variables win over `--env-file`). Record model, latency, check result per run. If the command is blocked or keys are missing, stop this step and record it as open for Gate 2. Never print keys.
- [ ] **Step 3: ADR 0004 amendment** (dated 2026-11-03): original free models gone after four weeks; new chain (D4) with the chosen `AI_FREE_MODELS` (order by valid outputs, then latency) and Anthropic `claude-haiku-5-5` via the official SDK; data rule (free models only for published products, drafts to Anthropic); the trial table; or a marked placeholder if Step 2 was open.
- [ ] **Step 4: Docs.** `data-model.md`: `ai_request`, `ai_generation.request_id`, reserve function, limits. `deploy.md`: the D9 variables for Coolify, recommended `AI_FREE_MODELS`, provider limits (Anthropic workspace spend limit, OpenRouter key credit limit 0), the 90-s proxy timeout check, first live click after deploy. `revocation.md`: `remove_catalog()` clears `ai_request` and `ai_generation`. `CLAUDE.md` Commands: one line for `pnpm ai:try`. Write the `.env.example` lines (D9 variables, empty values, one comment each) into the task report for the Gate 2 report; the user edits that file.
- [ ] **Step 5: Verify** `pnpm exec prettier --check docs` exit 0; `grep -n "/Users/" docs -r` prints nothing.
- [ ] **Step 6: Commit** `docs: record the AI model chain, limits and operator steps`.

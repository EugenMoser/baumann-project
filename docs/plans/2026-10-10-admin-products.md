# Feature 6a — Admin: auth & products — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin signs in with e-mail and password and maintains products, articles and colour assignments; every change is live on the public site on the next request.

**Architecture:** `@supabase/ssr` cookie sessions; `proxy.ts` refreshes the session and redirects optimistically, `checkAdmin()` guards every admin layout and Server Action, RLS stays the boundary. Admin data access in `lib/admin/*` returns `Result<T, AdminError>`; Server Actions wrap writes in `adminWrite()` which checks the session, logs DB errors without values and calls `revalidatePath('/', 'layout')` on success. Multi-table writes go through two `security invoker` Postgres functions.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, `proxy.ts`), React 19.2, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Zod 4, Vitest, pgTAP, Playwright.

**Spec:** `docs/specs/2026-10-10-admin-products-design.md` (FR-/SC-IDs referenced below).

## Global Constraints

- TypeScript `strict: true`; no `any` without a comment explaining why.
- Zod for all external input (forms, search params, env, CLI args).
- UI copy German; code, identifiers, comments, commit messages English.
- Never remove the demo banner or `noindex` (meta, `X-Robots-Tag`, `robots.txt`).
- Service-role key only in scripts (`admin:create`, import), never in app code or `NEXT_PUBLIC_*`.
- Logs never contain submitted form values, passwords or e-mail addresses (FR-14).
- Article numbers are taken as typed (trimmed only) and are read-only after creation (D8).
- Every new SQL function: `set search_path = ''`, explicit `revoke … from public, anon`, explicit `grant … to authenticated`.
- Public pages must not read cookies; `proxy.ts` matcher stays `/admin/:path*`.
- Next.js 16 differs from older versions: read the relevant file in `node_modules/next/dist/docs/` before using `proxy.ts`, `cookies()`, `redirect()`, `revalidatePath()`, route groups or `useActionState`.
- Commits: Conventional Commits, one per task (WIP commits on `feat/admin-products` are allowed; the Husky hook runs gitleaks, lint-staged, typecheck, test — never bypass it).
- Run `pnpm db:types` after every migration; CI fails if `lib/supabase/database.types.ts` is stale.

## Review Focus

1. **Search text with LIKE/PostgREST special characters** (`%`, `_`, `,`, `(`, `)`, `\`) in the product list filter → matched literally, never a 500. Test in Task 8.
2. **Odd or repeated search params** (`?status=foo&kategorie=abc&kategorie=1`) → ignored or first value used, list still renders. Test in Task 8 (`parseFilter`).
3. **Session expired while a form is open** → the submit redirects to the login page and writes nothing. Test in Task 7 (`adminWrite` with `anonymous`).
4. **Category changed on a product whose articles carry attributes of the old category** → existing values stay and are still shown and editable in the article dialog. Test in Task 10 (`attributeInputsFor`).
5. **Article deleted in another tab, then saved from a stale dialog** → "nicht gefunden" form error, no crash, nothing created. Test in Task 3 (pgTAP `P0002`) and Task 7 (`fromPg` mapping).

---

## File map

| File                                                                                     | Responsibility                                                            | Task |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| `app/(site)/layout.tsx`, moved public routes                                             | Public chrome (header/footer) only for public pages                       | 1    |
| `components/ui/*`, `lib/utils.ts`, `components.json`, `app/globals.css`                  | shadcn/ui primitives and theme tokens                                     | 1    |
| `lib/catalog/slug.ts`                                                                    | `slugify` shared by importer and admin                                    | 2    |
| `supabase/migrations/20261012090000_admin_functions.sql`                                 | `admin_save_article`, `admin_set_product_colors`, product delete policy   | 3    |
| `supabase/tests/11_admin.test.sql`                                                       | SC-8, SC-10, SC-12 (DB)                                                   | 3    |
| `lib/supabase/session.ts`                                                                | cookie-based server client                                                | 4    |
| `lib/admin/auth.ts`                                                                      | `classifyClaims`, `checkAdmin`, `safeNext`, paths                         | 4    |
| `proxy.ts`                                                                               | session refresh + optimistic redirect                                     | 4    |
| `scripts/admin/create.mts`                                                               | `pnpm admin:create`                                                       | 5    |
| `app/admin/**` login, layout, header                                                     | login/logout, protected shell, 403                                        | 6    |
| `lib/admin/{errors,form,write,origin,product-rules,schemas}.ts`                          | pure logic: errors, form state, write wrapper, origin, publish rules, Zod | 7    |
| `lib/admin/{products,filter,server}.ts`                                                  | product data access, list filter, server wiring                           | 8    |
| `app/admin/(protected)/produkte/**`, `components/admin/product-*`                        | list, create/edit form, product actions                                   | 9    |
| `lib/admin/articles.ts`, `lib/admin/article-schema.ts`, `components/admin/article-*`     | articles                                                                  | 10   |
| `lib/admin/colors.ts`, `lib/admin/color-schema.ts`, `components/admin/color-section.tsx` | colour assignments                                                        | 11   |
| `e2e/admin/**`, `playwright.config.ts`                                                   | E2E for admin                                                             | 12   |
| docs, roadmap, CLAUDE.md commands                                                        | documentation                                                             | 13   |

---

### Task 1: Dependencies, shadcn/ui and a public route group

Covers: FR-4 (shell basis), D5. Public look must stay unchanged (SC-4 review).

**Files:**

- Create: `components.json`, `lib/utils.ts`, `components/ui/{button,input,textarea,label,table,dialog,alert-dialog,badge,sonner}.tsx`, `app/(site)/layout.tsx`, `app/(site)/not-found.tsx`, `app/(site)/error.tsx`, `components/site/not-found-content.tsx`
- Move (git mv): `app/page.tsx`, `app/produkte/`, `app/suche/`, `app/qualitaet/`, `app/anfrage/` → `app/(site)/…`
- Modify: `app/layout.tsx`, `app/not-found.tsx`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`

**Interfaces:**

- Produces: `cn(...inputs)` in `lib/utils.ts`; shadcn components under `@/components/ui/*`; theme tokens `primary`, `primary-foreground`, `secondary`, `muted-foreground`, `accent-foreground`, `destructive`, `border`, `input`, `ring`, `background`, `foreground`, `popover`, `card` (+ `-foreground`). Existing tokens `paper`, `surface`, `ink`, `muted`, `line`, `accent`, `accent-strong` keep their values.

- [ ] **Step 1: "Before" screenshots of the public site**

The local stack must run (`pnpm db:start && pnpm db:reset`). Build against it and capture:

```bash
eval "$(pnpm exec supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^PUBLISHABLE_KEY=/export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p')"
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
pnpm build && (PORT=3000 HOSTNAME=127.0.0.1 pnpm start:standalone > /dev/null 2>&1 &) && sleep 5
mkdir -p .claude/work/screens
pnpm exec playwright screenshot --full-page http://localhost:3000/ .claude/work/screens/before-home.png
pnpm exec playwright screenshot --full-page http://localhost:3000/produkte/moebelteile/testkeil-mit-daempfung .claude/work/screens/before-product.png
pkill -f ".next/standalone/server.js"
```

If `supabase status -o env` uses different variable names, read them from `pnpm exec supabase status -o json` (`API_URL`, `PUBLISHABLE_KEY`) instead. `.claude/` is excluded from git; the screenshots never get committed.

- [ ] **Step 2: Install dependencies and generate shadcn components**

```bash
pnpm add @supabase/ssr
pnpm dlx shadcn@latest init --base-color neutral --yes
pnpm dlx shadcn@latest add button input textarea label table dialog alert-dialog badge sonner --yes
```

Expected: `components.json`, `lib/utils.ts`, `components/ui/*.tsx` exist; runtime deps (`radix-ui` or `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`) and `tw-animate-css` are in `package.json`. If the CLI asks interactive questions despite `--yes`, choose: style default, base colour neutral, CSS variables yes. If the CLI put `tw-animate-css` into `dependencies`, move it to `devDependencies` (`pnpm remove tw-animate-css && pnpm add -D tw-animate-css`). Do not add `next-themes` (light theme only); if `sonner.tsx` imports `next-themes`, replace its `useTheme()` usage with the fixed theme `"light"`.

- [ ] **Step 3: Replace the CLI's `globals.css` changes with an explicit token block**

The CLI rewrites `app/globals.css` (adds `:root` variables, `.dark`, `@theme inline` and an `@layer base` with `*`/`body` rules). Those base rules and the colliding `--color-muted` / `--color-accent` would change the public site. Restore the file and add tokens by hand:

```bash
git checkout -- app/globals.css
```

Then make `app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

/* Light theme only (feature 4 spec, D9). Calm, technical catalogue look. */
@theme {
  --color-paper: #ffffff;
  --color-surface: #f3f4f5;
  --color-ink: #15191d;
  --color-muted: #59626b;
  --color-line: #d8dce0;
  --color-accent: #1d5c96;
  --color-accent-strong: #154675;

  /* shadcn/ui tokens (feature 6a, D5), mapped onto the palette above.
     `muted` and `accent` keep their public meaning; generated components use
     `bg-surface` instead of `bg-muted` (see components/ui). */
  --color-background: #ffffff;
  --color-foreground: #15191d;
  --color-card: #ffffff;
  --color-card-foreground: #15191d;
  --color-popover: #ffffff;
  --color-popover-foreground: #15191d;
  --color-primary: #1d5c96;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f3f4f5;
  --color-secondary-foreground: #15191d;
  --color-muted-foreground: #59626b;
  --color-accent-foreground: #ffffff;
  --color-destructive: #b42318;
  --color-border: #d8dce0;
  --color-input: #d8dce0;
  --color-ring: #1d5c96;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Then in `components/ui/*.tsx` replace background usages of `muted` with `surface` (text usages `text-muted-foreground` stay):

```bash
sed -i '' -E 's/bg-muted(\/[0-9]+)?/bg-surface/g' components/ui/*.tsx
grep -n "bg-muted\|var(--" components/ui/*.tsx || true
```

Any remaining `var(--…)` reference to a variable not defined above (e.g. `--radius`) must be replaced with the Tailwind default class (`rounded-md`).

- [ ] **Step 4: Move public routes into the `(site)` group**

Admin pages must not show the public header/footer. Route groups do not change URLs.

```bash
mkdir -p "app/(site)"
git mv app/page.tsx app/produkte app/suche app/qualitaet app/anfrage "app/(site)/"
```

`app/layout.tsx` keeps `<html>`, `<body>`, fonts, metadata (incl. `robots: { index: false, follow: false }`) and `DemoBanner`; it no longer renders `SiteHeader`/`SiteFooter`:

```tsx
<body className="flex min-h-full flex-col bg-paper font-sans text-ink">
  <DemoBanner branding={branding} />
  <div className="flex flex-1 flex-col">{children}</div>
</body>
```

Remove the now unused `SiteHeader`/`SiteFooter` imports there. Create `app/(site)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { branding } from "@/config/branding";

// Public chrome; the admin (feature 6a) has its own shell.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader branding={branding} />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter branding={branding} />
    </>
  );
}
```

Move the body of the current `app/not-found.tsx` into `components/site/not-found-content.tsx` (export `NotFoundContent`). `app/(site)/not-found.tsx` renders `<NotFoundContent />` (used by `notFound()` in public pages, inside the site layout). `app/not-found.tsx` (unmatched URLs, root layout only) renders:

```tsx
<>
  <SiteHeader branding={branding} />
  <NotFoundContent />
  <SiteFooter branding={branding} />
</>
```

Keep the existing `metadata` export of `app/not-found.tsx`. Create `app/(site)/error.tsx`:

```tsx
"use client";

// Errors in public pages render inside the site layout (header/footer stay).
export { default } from "../error";
```

If Next rejects the re-export (build error about `"use client"` boundaries), copy the component from `app/error.tsx` instead.

- [ ] **Step 5: Verify and take "after" screenshots**

```bash
pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all exit 0 (moved `app/(site)/qualitaet/page.test.tsx` still passes; fix relative imports in moved files if any). Then repeat Step 1's build/screenshot commands with `after-` file names and compare visually (Read both PNGs). Expected: no visible difference. Also run `pnpm e2e` (the public suite must stay green). Record "before/after identical" for the Gate 2 report.

- [ ] **Step 6: Commit**

```bash
git add -A app components components.json lib/utils.ts package.json pnpm-lock.yaml
git commit -m "chore(admin): add shadcn/ui and @supabase/ssr, move public routes into a route group"
```

---

### Task 2: Shared `slugify`

Covers: D6 (slug from name).

**Files:**

- Create: `lib/catalog/slug.ts`, `lib/catalog/slug.test.ts`
- Modify: `scripts/import/map/text.mts`

**Interfaces:**

- Produces: `slugify(value: string): string` and `SLUG_PATTERN: RegExp` (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) from `@/lib/catalog/slug`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/catalog/slug.test.ts
import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Schließkeile mit Dämpfung", "schliesskeile-mit-daempfung"],
    ["  Rohrschelle Ø 15 mm ", "rohrschelle-15-mm"],
    ["Café/Größe (neu)", "cafe-groesse-neu"],
    ["---", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("produces slugs that match the database check", () => {
    expect(SLUG_PATTERN.test(slugify("Testkeil 8 mm"))).toBe(true);
    expect(SLUG_PATTERN.test("Bad Slug")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/catalog/slug.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Move `slugify` and its `GERMAN` map from `scripts/import/map/text.mts` into `lib/catalog/slug.ts` (plain TS, no `server-only`, it runs in client components too), add `export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;`. In `text.mts` replace the definition with a re-export so all importer imports keep working:

```ts
export { slugify } from "../../../lib/catalog/slug.ts";
```

(Scripts run on plain Node with type stripping: keep the explicit `.ts` extension, like the existing `database.types.ts` import in `scripts/import/cli.mts`.)

- [ ] **Step 4: Run** `pnpm vitest run lib/catalog/slug.test.ts tests/import && pnpm typecheck` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "refactor(catalog): share slugify between importer and admin"`

---

### Task 3: Admin database functions and delete rule

Covers: FR-8/SC-8, FR-10/SC-10, FR-12/SC-12 (DB part), Review Focus 5.

**Files:**

- Create: `supabase/migrations/20261012090000_admin_functions.sql`, `supabase/tests/11_admin.test.sql`
- Modify: `lib/supabase/database.types.ts` (generated)

**Interfaces:**

- Produces:
  - `public.admin_save_article(payload jsonb) returns bigint` — payload `{ id?: number|null, product_id: number, article_number: string (ignored on update), name, description, note: string|null, material_id: number|null, material_note: string|null, sort_order: number, attributes: [{ attribute_id, value_decimal, value_text }], packaging: [{ quantity, label }] }`; returns the article id. Raises `42501` (not admin), `P0002` (id not found for that product), `23505` (`article_article_number_key`), `23514`/`23503` (attribute type/unknown attribute, from the existing trigger).
  - `public.admin_set_product_colors(p_product_id bigint, payload jsonb) returns void` — payload `[{ color_id, suffix: string|null, is_default: boolean }]` in display order; raises `42501`, `P0002` (product not visible), `22023` with the German messages below.
  - Product delete policy requires `status <> 'published'`.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/11_admin.test.sql
begin;
select plan(27);

-- Privileges
select ok(not has_function_privilege('anon', 'public.admin_save_article(jsonb)', 'execute'), 'anon cannot call admin_save_article');
select ok(has_function_privilege('authenticated', 'public.admin_save_article(jsonb)', 'execute'), 'authenticated can call admin_save_article');
select ok(not has_function_privilege('anon', 'public.admin_set_product_colors(bigint, jsonb)', 'execute'), 'anon cannot call admin_set_product_colors');
select ok(has_function_privilege('authenticated', 'public.admin_set_product_colors(bigint, jsonb)', 'execute'), 'authenticated can call admin_set_product_colors');

-- Non-admin: functions refuse
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.admin_save_article('{"product_id":1,"article_number":"99401","sort_order":0}'::jsonb)$$, '42501', null, 'non-admin cannot save articles');
select throws_ok($$select public.admin_set_product_colors(1, '[]'::jsonb)$$, '42501', null, 'non-admin cannot set colours');
reset role;

-- Admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';

select isnt(
  public.admin_save_article($j${"product_id":4,"article_number":"99401","name":"Neu","description":null,"note":null,"material_id":null,"material_note":null,"sort_order":1,
    "attributes":[{"attribute_id":1,"value_decimal":8.5,"value_text":null}],
    "packaging":[{"quantity":25,"label":"Beutel"}]}$j$::jsonb),
  null, 'admin inserts an article');
select is((select aa.value_decimal from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '99401'), 8.5::numeric, 'attribute stored');
select is((select count(*) from public.article_packaging p join public.article a on a.id = p.article_id where a.article_number = '99401'), 1::bigint, 'pack size stored');

select lives_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'article_number', 'IGNORED', 'name', 'Neu 2', 'sort_order', 1,
  'attributes', '[]'::jsonb,
  'packaging', '[{"quantity":50,"label":null},{"quantity":100,"label":null}]'::jsonb))$$, 'admin updates an article');
select is((select name from public.article where article_number = '99401'), 'Neu 2', 'update changes the name and keeps the number');
select is((select count(*) from public.article where article_number = 'IGNORED'), 0::bigint, 'article number is never updated');
select is((select count(*) from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '99401'), 0::bigint, 'attributes replaced');
select is((select array_agg(p.quantity order by p.sort_order) from public.article_packaging p join public.article a on a.id = p.article_id where a.article_number = '99401'), array[50, 100], 'pack sizes replaced in order');

select throws_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'name', 'Kaputt', 'sort_order', 1,
  'attributes', '[{"attribute_id":1,"value_decimal":null,"value_text":"x"}]'::jsonb,
  'packaging', '[]'::jsonb))$$, '23514', null, 'a wrong attribute type raises');
select is((select name from public.article where article_number = '99401'), 'Neu 2', 'the failed call changed nothing');
select throws_ok($$select public.admin_save_article('{"id":999999,"product_id":4,"name":"x","sort_order":0,"attributes":[],"packaging":[]}'::jsonb)$$, 'P0002', null, 'a missing article raises not found');
select throws_ok($$select public.admin_save_article('{"product_id":4,"article_number":"99010","sort_order":0,"attributes":[],"packaging":[]}'::jsonb)$$, '23505', null, 'a taken article number raises unique violation');

-- Colours
select lives_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"7","is_default":true},{"color_id":1,"suffix":null,"is_default":false}]'::jsonb)$$, 'admin replaces the colour set');
select is((select array_agg(color_id order by sort_order) from public.product_color where product_id = 1), array[2::bigint, 1::bigint], 'rows replaced in display order');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":true},{"color_id":2,"suffix":"2","is_default":false}]'::jsonb)$$, '22023', 'Jede Farbe darf nur einmal zugeordnet sein.', 'duplicate colour raises');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":true},{"color_id":1,"suffix":"1","is_default":false}]'::jsonb)$$, '22023', 'Jedes Suffix darf nur einmal vorkommen.', 'duplicate suffix raises');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":false}]'::jsonb)$$, '22023', 'Genau eine Farbe muss Standard sein.', 'no default raises');
select is((select count(*) from public.product_color where product_id = 1), 2::bigint, 'failed calls keep the previous set');

-- Delete rule (D10)
select results_eq($$with d as (delete from public.product where slug = 'testkeil-mit-daempfung' returning 1) select count(*) from d$$, $$values (0::bigint)$$, 'admin cannot delete a published product');
select results_eq($$with d as (delete from public.product where slug = 'entwurfsteil' returning 1) select count(*) from d$$, $$values (1::bigint)$$, 'admin can delete a draft');
select is((select count(*) from public.article where product_id = 4) + (select count(*) from public.product_color where product_id = 4), 0::bigint, 'the cascade removed articles and colour rows');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run** `pnpm exec supabase test db` — Expected: `11_admin.test.sql` fails (functions do not exist).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261012090000_admin_functions.sql
-- Admin writes that span several tables (feature 6a, D8/D9). security invoker:
-- RLS applies; the explicit admin check gives a clear 42501 instead of a
-- silent no-op.

create function public.admin_save_article(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_product bigint := (payload ->> 'product_id')::bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if payload ->> 'id' is not null then
    -- The article number is never updated (numbering system, spec D8).
    update public.article set
      name = payload ->> 'name',
      description = payload ->> 'description',
      note = payload ->> 'note',
      material_id = (payload ->> 'material_id')::bigint,
      material_note = payload ->> 'material_note',
      sort_order = coalesce((payload ->> 'sort_order')::integer, 0)
    where id = (payload ->> 'id')::bigint and product_id = v_product
    returning id into v_id;
    if v_id is null then
      raise exception 'Artikel nicht gefunden.' using errcode = 'P0002';
    end if;
  else
    insert into public.article (product_id, article_number, name, description, note, material_id, material_note, sort_order)
    values (
      v_product,
      btrim(payload ->> 'article_number'),
      payload ->> 'name',
      payload ->> 'description',
      payload ->> 'note',
      (payload ->> 'material_id')::bigint,
      payload ->> 'material_note',
      coalesce((payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  delete from public.article_attribute where article_id = v_id;
  insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text)
  select v_id, (a ->> 'attribute_id')::bigint, (a ->> 'value_decimal')::numeric, a ->> 'value_text'
  from jsonb_array_elements(coalesce(payload -> 'attributes', '[]'::jsonb)) as a;

  delete from public.article_packaging where article_id = v_id;
  insert into public.article_packaging (article_id, quantity, label, sort_order)
  select v_id, (p ->> 'quantity')::integer, nullif(btrim(p ->> 'label'), ''), (ord - 1)::integer
  from jsonb_array_elements(coalesce(payload -> 'packaging', '[]'::jsonb)) with ordinality as t(p, ord);

  -- "Last change" in the admin list reflects article edits.
  update public.product set updated_at = now() where id = v_product;
  return v_id;
end;
$$;

create function public.admin_set_product_colors(p_product_id bigint, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product where id = p_product_id) then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;

  select count(*) into v_rows from jsonb_array_elements(payload);
  if (select count(distinct (e ->> 'color_id')) from jsonb_array_elements(payload) e) <> v_rows then
    raise exception 'Jede Farbe darf nur einmal zugeordnet sein.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload) e
    where nullif(btrim(e ->> 'suffix'), '') is not null
    group by btrim(e ->> 'suffix') having count(*) > 1
  ) then
    raise exception 'Jedes Suffix darf nur einmal vorkommen.' using errcode = '22023';
  end if;
  if v_rows > 0 and (select count(*) from jsonb_array_elements(payload) e where (e ->> 'is_default')::boolean) <> 1 then
    raise exception 'Genau eine Farbe muss Standard sein.' using errcode = '22023';
  end if;

  delete from public.product_color where product_id = p_product_id;
  insert into public.product_color (product_id, color_id, suffix, is_default, sort_order)
  select p_product_id, (e ->> 'color_id')::bigint, nullif(btrim(e ->> 'suffix'), ''),
         coalesce((e ->> 'is_default')::boolean, false), (ord - 1)::integer
  from jsonb_array_elements(payload) with ordinality as t(e, ord);

  update public.product set updated_at = now() where id = p_product_id;
end;
$$;

revoke all on function public.admin_save_article(jsonb) from public, anon;
grant execute on function public.admin_save_article(jsonb) to authenticated;
revoke all on function public.admin_set_product_colors(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_product_colors(bigint, jsonb) to authenticated;

-- D10: published products are archived, never deleted (defence in depth;
-- the admin UI hides the button and the action refuses).
drop policy "admin delete" on public.product;
create policy "admin delete" on public.product for delete to authenticated
  using ((select private.is_admin()) and status <> 'published');
```

- [ ] **Step 4: Run tests and regenerate types**

```bash
pnpm db:reset && pnpm exec supabase test db && pnpm db:types && pnpm typecheck
```

Expected: all pgTAP files pass (incl. `04_rls` — its delete case uses a draft product). `database.types.ts` now lists both functions under `Functions`.

- [ ] **Step 5: Commit** `git commit -m "feat(db): admin functions for articles and colours, no deletion of published products"`

---

### Task 4: Session client, admin check and proxy

Covers: FR-1/SC-1 (unit), FR-2/SC-2 (`safeNext`), D2.

**Files:**

- Create: `lib/supabase/session.ts`, `lib/admin/auth.ts`, `lib/admin/auth.test.ts`, `proxy.ts`
- Modify: `lib/supabase/server.ts` (comment only: sessions now live in `session.ts`)

**Interfaces:**

- Produces:
  - `createSessionSupabase(): Promise<AdminClient>` (`server-only`), `type AdminClient = SupabaseClient<Database>`
  - `type AdminCheck = { kind: "admin"; userId: string; email: string | null } | { kind: "forbidden"; email: string | null } | { kind: "anonymous" }`
  - `classifyClaims(claims: unknown): AdminCheck`, `checkAdmin(client: AdminClient): Promise<AdminCheck>`
  - `LOGIN_PATH = "/admin/login"`, `ADMIN_HOME = "/admin/produkte"`, `safeNext(raw: unknown): string`, `loginPathFor(next: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// lib/admin/auth.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_HOME,
  checkAdmin,
  classifyClaims,
  loginPathFor,
  safeNext,
} from "./auth";
import type { AdminClient } from "@/lib/supabase/session";

vi.mock("server-only", () => ({}));

describe("classifyClaims (SC-1)", () => {
  it("admin claims → admin", () => {
    expect(
      classifyClaims({
        sub: "u1",
        email: "a@example.com",
        app_metadata: { role: "admin" },
      })
    ).toEqual({ kind: "admin", userId: "u1", email: "a@example.com" });
  });
  it("claims without admin role → forbidden", () => {
    expect(classifyClaims({ sub: "u2", app_metadata: {} })).toEqual({
      kind: "forbidden",
      email: null,
    });
    expect(
      classifyClaims({ sub: "u2", user_metadata: { role: "admin" } })
    ).toEqual({ kind: "forbidden", email: null });
  });
  it("no claims → anonymous", () => {
    expect(classifyClaims(null)).toEqual({ kind: "anonymous" });
    expect(classifyClaims({})).toEqual({ kind: "anonymous" });
  });
});

describe("checkAdmin", () => {
  const client = (result: unknown) =>
    ({
      auth: { getClaims: vi.fn().mockResolvedValue(result) },
    }) as unknown as AdminClient;
  it("maps an auth error to anonymous", async () => {
    expect(
      await checkAdmin(client({ data: null, error: new Error("x") }))
    ).toEqual({ kind: "anonymous" });
  });
  it("classifies returned claims", async () => {
    const result = {
      data: { claims: { sub: "u1", app_metadata: { role: "admin" } } },
      error: null,
    };
    expect((await checkAdmin(client(result))).kind).toBe("admin");
  });
});

describe("safeNext (SC-2)", () => {
  it.each(["/admin/produkte/3", "/admin/produkte?status=draft"])(
    "accepts %s",
    (path) => {
      expect(safeNext(path)).toBe(path);
    }
  );
  it.each([
    "//evil.example",
    "https://evil.example/admin/x",
    "/produkte",
    "/admin",
    "/admin/login",
    "/admin/..//evil.example",
    "/admin\\evil",
    null,
    42,
  ])("rejects %s", (value) => {
    expect(safeNext(value)).toBe(ADMIN_HOME);
  });
  it("builds the login path with an encoded next", () => {
    expect(loginPathFor("/admin/produkte")).toBe(
      "/admin/login?next=%2Fadmin%2Fprodukte"
    );
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin/auth.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Read first: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, `…/03-api-reference/03-file-conventions/proxy.md`, `…/03-api-reference/04-functions/cookies.md`, and `npx ctx7@latest docs /supabase/ssr "Next.js App Router createServerClient cookies getAll setAll proxy"`.

```ts
// lib/supabase/session.ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export type AdminClient = SupabaseClient<Database>;

// Admin only (spec D2): reads the session from cookies. Public pages keep
// using createServerSupabase() and never touch cookies.
export async function createSessionSupabase(): Promise<AdminClient> {
  const store = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list)
              store.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there;
            // proxy.ts refreshes the session instead.
          }
        },
      },
    }
  );
}
```

```ts
// lib/admin/auth.ts
import type { AdminClient } from "@/lib/supabase/session";

export const LOGIN_PATH = "/admin/login";
export const ADMIN_HOME = "/admin/produkte";

export type AdminCheck =
  | { kind: "admin"; userId: string; email: string | null }
  | { kind: "forbidden"; email: string | null }
  | { kind: "anonymous" };

// Admin = app_metadata.role "admin", the same claim private.is_admin() checks.
// user_metadata is user-editable and never counts.
export function classifyClaims(claims: unknown): AdminCheck {
  if (typeof claims !== "object" || claims === null)
    return { kind: "anonymous" };
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== "string") return { kind: "anonymous" };
  const email = typeof c.email === "string" ? c.email : null;
  const meta = c.app_metadata;
  const role =
    typeof meta === "object" && meta !== null && "role" in meta
      ? (meta as { role: unknown }).role
      : undefined;
  return role === "admin"
    ? { kind: "admin", userId: c.sub, email }
    : { kind: "forbidden", email };
}

export async function checkAdmin(client: AdminClient): Promise<AdminCheck> {
  const { data, error } = await client.auth.getClaims();
  if (error || !data) return { kind: "anonymous" };
  return classifyClaims(data.claims);
}

// Only paths below /admin/ (never the login page itself) — no open redirect.
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.includes("\\")) return ADMIN_HOME;
  let url: URL;
  try {
    url = new URL(raw, "http://admin.invalid");
  } catch {
    return ADMIN_HOME;
  }
  const path = url.pathname;
  if (
    url.origin !== "http://admin.invalid" ||
    raw.startsWith("//") ||
    !path.startsWith("/admin/") ||
    path.startsWith(LOGIN_PATH)
  )
    return ADMIN_HOME;
  return path + url.search;
}

export function loginPathFor(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
```

Note: `new URL("/admin/..//evil.example", base)` normalises to pathname `//evil.example`, which fails `startsWith("/admin/")` — that is why the check runs on the parsed pathname.

```ts
// proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, loginPathFor } from "@/lib/admin/auth";
import { publicEnv } from "@/lib/env/public";

// Optimistic check only (spec D2): refreshes the session cookie and sends
// visitors without a session to the login page. checkAdmin() in the admin
// layout and every action decides; RLS is the boundary.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list)
            response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && path !== LOGIN_PATH) {
    const target = new URL(
      loginPathFor(path + request.nextUrl.search),
      request.url
    );
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
```

If the installed `@supabase/ssr` version's `setAll` has no second `headers` parameter, drop that line (check the type in `node_modules/@supabase/ssr/dist/main/types.d.ts`).

- [ ] **Step 4: Run** `pnpm vitest run lib/admin/auth.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(admin): cookie sessions, admin check and proxy redirect"`

---

### Task 5: `pnpm admin:create`

Covers: FR-3/SC-3, D4.

**Files:**

- Create: `scripts/admin/create.mts`, `tests/admin/create.test.ts`, `tests/integration/admin-create.test.ts`
- Modify: `package.json` (script), `docs/deploy.md` (step 4: replace "Admin users are created manually.")

**Interfaces:**

- Consumes: `parseRemoveEnv` from `scripts/import/env.mts` (`IMPORT_SUPABASE_URL`, `IMPORT_SUPABASE_SECRET_KEY`).
- Produces: `runAdminCreate(argv: readonly string[], io: AdminCreateIo): Promise<number>` with `type AdminCreateIo = { env: Record<string, string | undefined>; log: (line: string) => void; error: (line: string) => void; readPassword: () => Promise<string> }`. Exit codes: 0 ok, 2 usage/invalid input, 1 env or Supabase error.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/admin/create.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  runAdminCreate,
  type AdminCreateIo,
} from "../../scripts/admin/create.mts";

const SECRET = "correct horse battery staple";

function io(password = SECRET, env: Record<string, string> = {}) {
  const lines: string[] = [];
  const value: AdminCreateIo = {
    env,
    log: (l) => lines.push(l),
    error: (l) => lines.push(l),
    readPassword: vi.fn().mockResolvedValue(password),
  };
  return { io: value, lines };
}

describe("admin:create argument checks (SC-3)", () => {
  it("requires --email", async () => {
    const { io: x, lines } = io();
    expect(await runAdminCreate([], x)).toBe(2);
    expect(lines.join("\n")).toMatch(/usage/);
  });
  it("rejects an invalid e-mail", async () => {
    const { io: x } = io();
    expect(await runAdminCreate(["--email", "nope"], x)).toBe(2);
  });
  it("rejects a short password without echoing it", async () => {
    const { io: x, lines } = io("short-pw");
    expect(await runAdminCreate(["--email", "a@example.com"], x)).toBe(2);
    expect(lines.join("\n")).toMatch(/at least 12/);
    expect(lines.join("\n")).not.toContain("short-pw");
  });
  it("fails on missing env without printing secrets", async () => {
    const { io: x, lines } = io();
    expect(await runAdminCreate(["--email", "a@example.com"], x)).toBe(1);
    expect(lines.join("\n")).not.toContain(SECRET);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/admin/create.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// scripts/admin/create.mts
// Creates or updates an admin user (spec D4).
// Usage: read -s PW && printf '%s' "$PW" | pnpm admin:create --email <address>
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseRemoveEnv } from "../import/env.mts";

export type AdminCreateIo = {
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  readPassword: () => Promise<string>;
};

const USAGE =
  "usage: printf '%s' \"$PW\" | pnpm admin:create --email <address>";
const MIN_PASSWORD = 12;

export async function runAdminCreate(
  argv: readonly string[],
  io: AdminCreateIo
): Promise<number> {
  let email: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { email: { type: "string" } },
      strict: true,
    });
    email = values.email;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (email === undefined) {
    io.error(USAGE);
    return 2;
  }
  const parsedEmail = z.email().safeParse(email.trim());
  if (!parsedEmail.success) {
    io.error("--email must be a valid e-mail address");
    return 2;
  }
  const password = (await io.readPassword()).replace(/\r?\n$/, "");
  if (password.length < MIN_PASSWORD) {
    io.error(`password on stdin must have at least ${MIN_PASSWORD} characters`);
    return 2;
  }
  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }

  const supabase = createClient(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const target = parsedEmail.data.toLowerCase();

  // Few users exist (single admin role); page through all of them.
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      io.error(`listing users failed: ${error.message}`);
      return 1;
    }
    const existing = data.users.find((u) => u.email?.toLowerCase() === target);
    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          app_metadata: { ...existing.app_metadata, role: "admin" },
        }
      );
      if (updateError) {
        io.error(`updating the admin failed: ${updateError.message}`);
        return 1;
      }
      io.log(`admin updated: ${target}`);
      return 0;
    }
    if (data.users.length < 200) break;
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email: target,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (createError) {
    io.error(`creating the admin failed: ${createError.message}`);
    return 1;
  }
  io.log(`admin created: ${target}`);
  return 0;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runAdminCreate(process.argv.slice(2), {
      env: process.env,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
      readPassword: readStdin,
    });
    process.exit(code);
  } catch (error: unknown) {
    console.error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
```

`package.json` scripts: `"admin:create": "node --env-file-if-exists=.env.import scripts/admin/create.mts"`.

- [ ] **Step 4: Integration test against the local stack**

```ts
// tests/integration/admin-create.test.ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { runAdminCreate } from "../../scripts/admin/create.mts";

const EMAIL = "int-admin-create@example.test";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const service = createClient(
  process.env.IMPORT_SUPABASE_URL ?? "",
  process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

const run = (password: string) =>
  runAdminCreate(["--email", EMAIL], {
    env: process.env,
    log: () => undefined,
    error: () => undefined,
    readPassword: async () => password,
  });

async function signIn(password: string) {
  const client = createClient(url, publishable, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: EMAIL,
    password,
  });
  return { client, error };
}

afterAll(async () => {
  const { data } = await service.auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users.filter((x) => x.email === EMAIL))
    await service.auth.admin.deleteUser(u.id);
});

describe("admin:create against the local stack (SC-3)", () => {
  it("creates an admin whose session passes private.is_admin()", async () => {
    expect(await run("first-password-123")).toBe(0);
    const { client, error } = await signIn("first-password-123");
    expect(error).toBeNull();
    // Drafts are visible only when private.is_admin() is true.
    const { data } = await client
      .from("product")
      .select("id")
      .eq("status", "draft");
    expect(data?.length).toBeGreaterThan(0);
  });

  it("updates the password on a second run without a second user", async () => {
    expect(await run("second-password-456")).toBe(0);
    expect((await signIn("second-password-456")).error).toBeNull();
    expect((await signIn("first-password-123")).error).not.toBeNull();
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    expect(data.users.filter((u) => u.email === EMAIL)).toHaveLength(1);
  });
});
```

Run: `pnpm vitest run tests/admin/create.test.ts && pnpm db:test` — Expected: PASS.

- [ ] **Step 5: Docs**

In `docs/deploy.md` step 4 replace "Admin users are created manually." with:

```markdown
Admin users are created with `pnpm admin:create` from a developer machine
(service-role key in `.env.import`, see `docs/import.md`):
`read -s PW && printf '%s' "$PW" | pnpm admin:create --email <address>`.
A second run with the same e-mail resets the password.
```

- [ ] **Step 6: Commit** `git commit -m "feat(admin): admin:create CLI for provisioning admin users"`

---

### Task 6: Login, logout and the protected admin shell

Covers: FR-1 (layout part), FR-2, FR-4 (header), D2, D3, D5.

**Files:**

- Create: `app/admin/page.tsx`, `app/admin/login/page.tsx`, `app/admin/login/actions.ts`, `components/admin/login-form.tsx`, `app/admin/(protected)/layout.tsx`, `components/admin/admin-header.tsx`, `components/admin/admin-header.test.tsx`, `components/admin/forbidden.tsx`, `components/admin/field.tsx`, `lib/admin/login.ts`, `lib/admin/login.test.ts`

**Interfaces:**

- Consumes: `createSessionSupabase`, `checkAdmin`, `safeNext`, `LOGIN_PATH`, `ADMIN_HOME` (Task 4); shadcn `Button`, `Input`, `Label`, `Toaster` (Task 1).
- Produces: `login(prev: LoginState, formData: FormData): Promise<LoginState>`, `logout(): Promise<void>` (Server Actions in `app/admin/login/actions.ts`); `type LoginState = { error: string | null; email: string }`; `LOGIN_FAILED = "E-Mail oder Passwort ist falsch."`; `Field`, `describedBy`, `selectClass` in `components/admin/field.tsx`; `AdminHeader({ email, shortName, logoutAction })`.

- [ ] **Step 1: Write failing tests**

```ts
// lib/admin/login.test.ts
import { describe, expect, it } from "vitest";
import { LOGIN_FAILED, loginSchema } from "./login";

describe("login schema (SC-2)", () => {
  it("accepts e-mail and password", () => {
    expect(
      loginSchema.safeParse({ email: "a@example.com", password: "x" }).success
    ).toBe(true);
  });
  it.each([
    { email: "", password: "x" },
    { email: "a@example.com", password: "" },
    { email: "nope", password: "x" },
  ])("rejects %o", (input) =>
    expect(loginSchema.safeParse(input).success).toBe(false)
  );
  it("has one generic message", () => {
    expect(LOGIN_FAILED).toBe("E-Mail oder Passwort ist falsch.");
  });
});
```

```tsx
// components/admin/admin-header.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminHeader } from "./admin-header";

describe("AdminHeader (SC-4)", () => {
  it("renders nav, e-mail and logout", () => {
    render(
      <AdminHeader
        email="admin@example.com"
        shortName="Muster"
        logoutAction={async () => {}}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Admin" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/admin/produkte"
    );
    expect(screen.getByRole("link", { name: "Zur Website" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abmelden" })
    ).toBeInTheDocument();
  });
  it("renders without an e-mail", () => {
    render(
      <AdminHeader
        email={null}
        shortName="Muster"
        logoutAction={async () => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: "Abmelden" })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin/login.test.ts components/admin/admin-header.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/admin/login.ts
import { z } from "zod";

export const LOGIN_FAILED = "E-Mail oder Passwort ist falsch.";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
```

```ts
// app/admin/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH, safeNext } from "@/lib/admin/auth";
import { LOGIN_FAILED, loginSchema } from "@/lib/admin/login";
import { createSessionSupabase } from "@/lib/supabase/session";

export type LoginState = { error: string | null; email: string };

// One generic message for every failure (spec D3); GoTrue rate-limits attempts.
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: LOGIN_FAILED, email };
  const supabase = await createSessionSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: LOGIN_FAILED, email };
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  const supabase = await createSessionSupabase();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
```

```tsx
// components/admin/field.tsx
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

export function describedBy(
  id: string,
  error?: string,
  hint?: string
): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(
    Boolean
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function Field(props: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const { id, label, error, hint, children } = props;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

Inputs pass `aria-invalid={Boolean(error)}` and `aria-describedby={describedBy(id, error, hint)}`.

```tsx
// components/admin/login-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoginState } from "@/app/admin/login/actions";
import { Field } from "./field";

type Props = {
  action: (prev: LoginState, formData: FormData) => Promise<LoginState>;
  next: string;
};

export function LoginForm({ action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    email: "",
  });
  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      <Field id="email" label="E-Mail">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
        />
      </Field>
      <Field id="password" label="Passwort">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
```

```tsx
// app/admin/login/page.tsx
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { safeNext } from "@/lib/admin/auth";
import { login } from "./actions";

export const metadata: Metadata = { title: "Admin-Anmeldung" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Admin-Anmeldung</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nur für die Pflege des Katalogs. Es gibt keine Registrierung.
      </p>
      <LoginForm
        action={login}
        next={safeNext(Array.isArray(next) ? next[0] : next)}
      />
    </main>
  );
}
```

```tsx
// app/admin/page.tsx
import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/admin/auth";

export default function AdminIndex() {
  redirect(ADMIN_HOME);
}
```

```tsx
// components/admin/admin-header.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  email: string | null;
  shortName: string;
  logoutAction: () => Promise<void>;
};

export function AdminHeader({ email, shortName, logoutAction }: Props) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <p className="font-semibold">Admin · {shortName}</p>
        <nav aria-label="Admin" className="flex gap-4 text-sm">
          <Link
            href="/admin/produkte"
            className="underline-offset-4 hover:underline"
          >
            Produkte
          </Link>
          <Link href="/" className="underline-offset-4 hover:underline">
            Zur Website
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {email ? (
            <span className="text-muted-foreground">{email}</span>
          ) : null}
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Abmelden
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
```

```tsx
// components/admin/forbidden.tsx
export function Forbidden() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
      <p className="mt-2 text-muted-foreground">
        Dieses Konto hat keine Admin-Rechte. Bitte melden Sie sich mit einem
        Admin-Konto an.
      </p>
    </main>
  );
}
```

```tsx
// app/admin/(protected)/layout.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { Forbidden } from "@/components/admin/forbidden";
import { Toaster } from "@/components/ui/sonner";
import { branding } from "@/config/branding";
import { checkAdmin, LOGIN_PATH } from "@/lib/admin/auth";
import { createSessionSupabase } from "@/lib/supabase/session";
import { logout } from "../login/actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s – Admin" },
};

// Second layer (spec D2): every protected page checks the claims itself.
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await checkAdmin(await createSessionSupabase());
  if (auth.kind === "anonymous") redirect(LOGIN_PATH);
  return (
    <>
      <AdminHeader
        email={auth.email}
        shortName={branding.shortName}
        logoutAction={logout}
      />
      {auth.kind === "forbidden" ? (
        <Forbidden />
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
      )}
      <Toaster />
    </>
  );
}
```

Check `branding.shortName` exists in `config/branding.ts` (it is used in `app/layout.tsx`'s title template). Admin pages inherit `robots: { index: false, follow: false }` from the root layout; do not override `robots` in admin metadata.

- [ ] **Step 4: Run** `pnpm vitest run lib/admin components/admin && pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm build` — Expected: PASS (build needs the env from Task 1 Step 1).

- [ ] **Step 5: Commit** `git commit -m "feat(admin): login, logout and protected admin shell"`

---

### Task 7: Pure admin logic — errors, form state, write wrapper, origin, publish rules, product schema

Covers: FR-6 (schema), FR-7/SC-7, FR-11/SC-11 (unit), FR-13/SC-13 (unit), FR-14/SC-14, Review Focus 3 and 5.

**Files:**

- Create: `lib/admin/errors.ts`, `lib/admin/form.ts`, `lib/admin/write.ts`, `lib/admin/origin.ts`, `lib/admin/product-rules.ts`, `lib/admin/schemas.ts`, `lib/admin/labels.ts` and tests `lib/admin/{errors,write,origin,product-rules,schemas}.test.ts`

**Interfaces:**

- Consumes: `AdminCheck` (Task 4), `Result`, `ok`, `err` (`lib/result.ts`), `SLUG_PATTERN`, `slugify` (Task 2), `ContentOrigin` from `lib/catalog/types.ts`.
- Produces:
  - `type AdminError = { kind: "forbidden" } | { kind: "not_found" } | { kind: "conflict"; field: string } | { kind: "invalid"; message: string } | { kind: "db_error"; code: string | null }`
  - `fromPg(error: { code?: string | null; message?: string; details?: string | null }, conflicts?: Record<string, string>): AdminError`
  - `formErrorFor(error: AdminError): string | null`, `CONFLICT_MESSAGES: Record<string, string>`, `GENERIC_SAVE_ERROR`, `FORBIDDEN_ERROR`, `NOT_FOUND_ERROR`
  - `type FieldErrors = Record<string, string>`, `type FormState<V> = { status: "idle" | "saved" | "error"; values: V; fieldErrors: FieldErrors; formError: string | null }`, `readFields<K extends string>(formData: FormData, fields: readonly K[]): Record<K, string>`, `zodFieldErrors(error: z.ZodError): FieldErrors`, `errorState<V>(values: V, error: AdminError): FormState<V>`, `idleState<V>(values: V): FormState<V>`
  - `type WriteDeps = { check: () => Promise<AdminCheck>; revalidate: () => void; logError: (context: string, code: string | null) => void }`, `type WriteOutcome<T> = { kind: "anonymous" } | { kind: "done"; result: Result<T, AdminError> }`, `adminWrite<T>(deps, context, write): Promise<WriteOutcome<T>>`
  - `nextOrigin(prev: ContentOrigin, changed: boolean): ContentOrigin`, `productOrigins(prev: OriginSource | null, next: OriginFields): { description_origin: ContentOrigin; seo_origin: ContentOrigin }` with `OriginFields = { description: string | null; seoTitle: string | null; seoDescription: string | null }`, `OriginSource = OriginFields & { descriptionOrigin: ContentOrigin; seoOrigin: ContentOrigin }`
  - `type PublishStats = { articleCount: number; colorCount: number; defaultColorCount: number }`, `publishProblem(stats: PublishStats): string | null`, `PUBLISH_NEEDS_ARTICLE`, `PUBLISH_NEEDS_DEFAULT`, `lastArticleProblem(status: ProductStatus, articleCount: number): string | null`, `LAST_ARTICLE`, `DELETE_PUBLISHED`
  - `PRODUCT_FIELDS`, `type ProductValues = Record<(typeof PRODUCT_FIELDS)[number], string>`, `productSchema`, `type ProductInput = z.output<typeof productSchema>`, `withDefaultSlug(values: ProductValues): ProductValues`, `emptyProductValues(): ProductValues`
  - `STATUS_LABEL: Record<ProductStatus, string>` (`draft` "Entwurf", `published` "Veröffentlicht", `archived` "Archiviert"), `type ProductStatus = Database["public"]["Enums"]["product_status"]`

- [ ] **Step 1: Write failing tests**

```ts
// lib/admin/errors.test.ts
import { describe, expect, it } from "vitest";
import { formErrorFor, fromPg, GENERIC_SAVE_ERROR } from "./errors";

describe("fromPg", () => {
  it("maps a known unique violation to a field conflict", () => {
    expect(
      fromPg(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "article_article_number_key"',
        },
        { article_article_number_key: "articleNumber" }
      )
    ).toEqual({ kind: "conflict", field: "articleNumber" });
  });
  it("maps an unknown unique violation to db_error", () => {
    expect(fromPg({ code: "23505", message: "other" }, {})).toEqual({
      kind: "db_error",
      code: "23505",
    });
  });
  it.each([
    ["42501", { kind: "forbidden" }],
    ["P0002", { kind: "not_found" }],
    [
      "22023",
      { kind: "invalid", message: "Genau eine Farbe muss Standard sein." },
    ],
    [
      "23514",
      { kind: "invalid", message: "Ein Wert passt nicht zum Attributtyp." },
    ],
    ["XX000", { kind: "db_error", code: "XX000" }],
  ])("maps %s", (code, expected) => {
    expect(
      fromPg({ code, message: "Genau eine Farbe muss Standard sein." })
    ).toEqual(expected);
  });
  it("uses the generic message for db errors", () => {
    expect(formErrorFor({ kind: "db_error", code: null })).toBe(
      GENERIC_SAVE_ERROR
    );
    expect(formErrorFor({ kind: "conflict", field: "slug" })).toBeNull();
  });
});
```

```ts
// lib/admin/write.test.ts
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { adminWrite, type WriteDeps } from "./write";

function deps(kind: "admin" | "forbidden" | "anonymous"): WriteDeps & {
  revalidate: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
} {
  const check =
    kind === "admin"
      ? ({ kind, userId: "u", email: "admin@example.com" } as const)
      : kind === "forbidden"
        ? ({ kind, email: "x@example.com" } as const)
        : ({ kind } as const);
  return {
    check: vi.fn().mockResolvedValue(check),
    revalidate: vi.fn(),
    logError: vi.fn(),
  };
}

describe("adminWrite (SC-13, SC-14, Review Focus 3)", () => {
  it("revalidates after a successful write", async () => {
    const d = deps("admin");
    const out = await adminWrite(d, "[admin] test", async () => ok(1));
    expect(out).toEqual({ kind: "done", result: ok(1) });
    expect(d.revalidate).toHaveBeenCalledTimes(1);
  });
  it("never revalidates after a failed write and logs only context and code", async () => {
    const d = deps("admin");
    await adminWrite(d, "[admin] test", async () =>
      err({ kind: "db_error", code: "XX000" } as const)
    );
    expect(d.revalidate).not.toHaveBeenCalled();
    expect(d.logError).toHaveBeenCalledWith("[admin] test", "XX000");
    expect(JSON.stringify(d.logError.mock.calls)).not.toContain("@");
  });
  it("does not log expected errors", async () => {
    const d = deps("admin");
    await adminWrite(d, "[admin] test", async () =>
      err({ kind: "conflict", field: "slug" } as const)
    );
    expect(d.logError).not.toHaveBeenCalled();
  });
  it("returns anonymous without writing when the session is gone", async () => {
    const d = deps("anonymous");
    const write = vi.fn();
    expect(await adminWrite(d, "[admin] test", write)).toEqual({
      kind: "anonymous",
    });
    expect(write).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });
  it("returns forbidden without writing for non-admins", async () => {
    const d = deps("forbidden");
    const write = vi.fn();
    expect(await adminWrite(d, "[admin] test", write)).toEqual({
      kind: "done",
      result: err({ kind: "forbidden" }),
    });
    expect(write).not.toHaveBeenCalled();
  });
});
```

```ts
// lib/admin/origin.test.ts
import { describe, expect, it } from "vitest";
import { nextOrigin, productOrigins } from "./origin";

describe("origin rule (SC-7)", () => {
  it.each([
    ["human", false, "human"],
    ["ai", false, "ai"],
    ["ai_edited", false, "ai_edited"],
    ["human", true, "human"],
    ["ai", true, "ai_edited"],
    ["ai_edited", true, "ai_edited"],
  ] as const)("%s, changed=%s → %s", (prev, changed, expected) => {
    expect(nextOrigin(prev, changed)).toBe(expected);
  });

  const base = {
    description: "Text",
    seoTitle: "Titel",
    seoDescription: "Beschreibung",
  };
  it("new products start as human", () => {
    expect(productOrigins(null, base)).toEqual({
      description_origin: "human",
      seo_origin: "human",
    });
  });
  it("tracks description and SEO separately", () => {
    const prev = { ...base, descriptionOrigin: "ai", seoOrigin: "ai" } as const;
    expect(productOrigins(prev, { ...base, description: "Neu" })).toEqual({
      description_origin: "ai_edited",
      seo_origin: "ai",
    });
    expect(productOrigins(prev, { ...base, seoDescription: "Neu" })).toEqual({
      description_origin: "ai",
      seo_origin: "ai_edited",
    });
    expect(productOrigins(prev, { ...base, seoTitle: null })).toEqual({
      description_origin: "ai",
      seo_origin: "ai_edited",
    });
  });
});
```

```ts
// lib/admin/product-rules.test.ts
import { describe, expect, it } from "vitest";
import {
  lastArticleProblem,
  LAST_ARTICLE,
  publishProblem,
  PUBLISH_NEEDS_ARTICLE,
  PUBLISH_NEEDS_DEFAULT,
} from "./product-rules";

describe("publish rules (SC-11)", () => {
  it("needs an article", () => {
    expect(
      publishProblem({ articleCount: 0, colorCount: 0, defaultColorCount: 0 })
    ).toBe(PUBLISH_NEEDS_ARTICLE);
  });
  it("needs exactly one default colour when colours exist", () => {
    expect(
      publishProblem({ articleCount: 1, colorCount: 2, defaultColorCount: 0 })
    ).toBe(PUBLISH_NEEDS_DEFAULT);
  });
  it("passes without colours or with one default", () => {
    expect(
      publishProblem({ articleCount: 1, colorCount: 0, defaultColorCount: 0 })
    ).toBeNull();
    expect(
      publishProblem({ articleCount: 2, colorCount: 3, defaultColorCount: 1 })
    ).toBeNull();
  });
  it("refuses deleting the last article of a published product", () => {
    expect(lastArticleProblem("published", 1)).toBe(LAST_ARTICLE);
    expect(lastArticleProblem("published", 2)).toBeNull();
    expect(lastArticleProblem("draft", 1)).toBeNull();
  });
});
```

```ts
// lib/admin/schemas.test.ts
import { describe, expect, it } from "vitest";
import {
  emptyProductValues,
  productSchema,
  withDefaultSlug,
  type ProductValues,
} from "./schemas";
import { zodFieldErrors } from "./form";

const valid: ProductValues = {
  ...emptyProductValues(),
  categoryId: "1",
  name: "Testkeil",
  slug: "testkeil",
  status: "draft",
  sortOrder: "0",
};

describe("product schema (SC-6)", () => {
  it("accepts valid input and normalises empty optionals to null", () => {
    const parsed = productSchema.parse(valid);
    expect(parsed).toMatchObject({
      categoryId: 1,
      name: "Testkeil",
      subtitle: null,
      materialId: null,
      sortOrder: 0,
    });
  });
  it.each([
    [{ name: "  " }, "name", "Bitte einen Namen eingeben."],
    [
      { slug: "Bad Slug" },
      "slug",
      "Nur Kleinbuchstaben, Ziffern und Bindestriche.",
    ],
    [{ categoryId: "" }, "categoryId", "Bitte eine Kategorie wählen."],
    [{ seoTitle: "x".repeat(71) }, "seoTitle", "Höchstens 70 Zeichen."],
    [
      { seoDescription: "x".repeat(161) },
      "seoDescription",
      "Höchstens 160 Zeichen.",
    ],
    [{ status: "deleted" }, "status", "Ungültiger Status."],
    [{ sortOrder: "1.5" }, "sortOrder", "Bitte eine ganze Zahl eingeben."],
  ])("rejects %o", (patch, field, message) => {
    const result = productSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(zodFieldErrors(result.error)[field]).toBe(message);
  });
  it("fills an empty slug from the name", () => {
    expect(
      withDefaultSlug({ ...valid, slug: " ", name: "Schließkeil 8 mm" }).slug
    ).toBe("schliesskeil-8-mm");
    expect(withDefaultSlug({ ...valid, slug: "eigener-slug" }).slug).toBe(
      "eigener-slug"
    );
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin` — Expected: new tests FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// lib/admin/errors.ts
export type AdminError =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "conflict"; field: string }
  | { kind: "invalid"; message: string }
  | { kind: "db_error"; code: string | null };

export const GENERIC_SAVE_ERROR = "Speichern fehlgeschlagen.";
export const FORBIDDEN_ERROR = "Keine Berechtigung.";
export const NOT_FOUND_ERROR =
  "Der Datensatz wurde nicht gefunden. Bitte die Seite neu laden.";
const TYPE_MISMATCH = "Ein Wert passt nicht zum Attributtyp.";

export const CONFLICT_MESSAGES: Record<string, string> = {
  slug: "Dieser Slug ist in der Kategorie schon vergeben.",
  articleNumber: "Diese Artikelnummer gibt es schon.",
};

type PgError = {
  code?: string | null;
  message?: string;
  details?: string | null;
};

// 22023 messages come from our own functions and are German by design.
export function fromPg(
  error: PgError,
  conflicts: Record<string, string> = {}
): AdminError {
  const code = error.code ?? null;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (code === "23505") {
    const constraint = Object.keys(conflicts).find((name) =>
      text.includes(name)
    );
    if (constraint)
      return { kind: "conflict", field: conflicts[constraint] ?? constraint };
  }
  if (code === "42501") return { kind: "forbidden" };
  if (code === "P0002") return { kind: "not_found" };
  if (code === "22023")
    return { kind: "invalid", message: error.message ?? GENERIC_SAVE_ERROR };
  if (code === "23514" || code === "23503")
    return { kind: "invalid", message: TYPE_MISMATCH };
  return { kind: "db_error", code };
}

export function formErrorFor(error: AdminError): string | null {
  switch (error.kind) {
    case "forbidden":
      return FORBIDDEN_ERROR;
    case "not_found":
      return NOT_FOUND_ERROR;
    case "invalid":
      return error.message;
    case "db_error":
      return GENERIC_SAVE_ERROR;
    case "conflict":
      return null;
  }
}
```

Note: `23503` from the attribute trigger means "unknown attribute"; `23503` from a foreign key (e.g. a deleted material) gets the same message — acceptable, the form shows lists from the DB.

```ts
// lib/admin/form.ts
import type { z } from "zod";
import { CONFLICT_MESSAGES, formErrorFor, type AdminError } from "./errors";

export type FieldErrors = Record<string, string>;

export type FormState<V> = {
  status: "idle" | "saved" | "error";
  values: V;
  fieldErrors: FieldErrors;
  formError: string | null;
};

export function readFields<K extends string>(
  formData: FormData,
  fields: readonly K[]
): Record<K, string> {
  const values = {} as Record<K, string>;
  for (const field of fields) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

// First message per field; nested paths are joined with dots (rows.0.suffix).
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

export const idleState = <V>(values: V): FormState<V> => ({
  status: "idle",
  values,
  fieldErrors: {},
  formError: null,
});

export function errorState<V>(values: V, error: AdminError): FormState<V> {
  if (error.kind === "conflict")
    return {
      status: "error",
      values,
      fieldErrors: {
        [error.field]: CONFLICT_MESSAGES[error.field] ?? "Wert schon vergeben.",
      },
      formError: null,
    };
  return {
    status: "error",
    values,
    fieldErrors: {},
    formError: formErrorFor(error),
  };
}
```

```ts
// lib/admin/write.ts
import { err, type Result } from "@/lib/result";
import type { AdminCheck } from "./auth";
import type { AdminError } from "./errors";

export type WriteDeps = {
  check: () => Promise<AdminCheck>;
  revalidate: () => void;
  // Receives a fixed context string and the PG code — never form values (FR-14).
  logError: (context: string, code: string | null) => void;
};

export type WriteOutcome<T> =
  { kind: "anonymous" } | { kind: "done"; result: Result<T, AdminError> };

// Every admin write goes through here: session check (D2), revalidation only
// after success (D11), logging of unexpected DB errors only (D12).
export async function adminWrite<T>(
  deps: WriteDeps,
  context: string,
  write: () => Promise<Result<T, AdminError>>
): Promise<WriteOutcome<T>> {
  const auth = await deps.check();
  if (auth.kind === "anonymous") return { kind: "anonymous" };
  if (auth.kind === "forbidden")
    return { kind: "done", result: err({ kind: "forbidden" }) };
  const result = await write();
  if (result.ok) deps.revalidate();
  else if (result.error.kind === "db_error")
    deps.logError(context, result.error.code);
  return { kind: "done", result };
}
```

```ts
// lib/admin/origin.ts
import type { ContentOrigin } from "@/lib/catalog/types";

export type OriginFields = {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};
export type OriginSource = OriginFields & {
  descriptionOrigin: ContentOrigin;
  seoOrigin: ContentOrigin;
};

// Spec D7: editing AI text marks it ai_edited; human text stays human.
export function nextOrigin(
  prev: ContentOrigin,
  changed: boolean
): ContentOrigin {
  if (!changed) return prev;
  return prev === "human" ? "human" : "ai_edited";
}

export function productOrigins(prev: OriginSource | null, next: OriginFields) {
  if (prev === null)
    return {
      description_origin: "human" as ContentOrigin,
      seo_origin: "human" as ContentOrigin,
    };
  return {
    description_origin: nextOrigin(
      prev.descriptionOrigin,
      prev.description !== next.description
    ),
    seo_origin: nextOrigin(
      prev.seoOrigin,
      prev.seoTitle !== next.seoTitle ||
        prev.seoDescription !== next.seoDescription
    ),
  };
}
```

```ts
// lib/admin/labels.ts
import type { Database } from "@/lib/supabase/database.types";

export type ProductStatus = Database["public"]["Enums"]["product_status"];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  archived: "Archiviert",
};
```

```ts
// lib/admin/product-rules.ts
import type { ProductStatus } from "./labels";

export type PublishStats = {
  articleCount: number;
  colorCount: number;
  defaultColorCount: number;
};

export const PUBLISH_NEEDS_ARTICLE =
  "Zum Veröffentlichen braucht das Produkt mindestens einen Artikel.";
export const PUBLISH_NEEDS_DEFAULT =
  "Zum Veröffentlichen braucht das Produkt genau eine Standardfarbe.";
export const LAST_ARTICLE =
  "Ein veröffentlichtes Produkt braucht mindestens einen Artikel. Bitte zuerst archivieren.";
export const DELETE_PUBLISHED =
  "Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.";

// Spec D10 — mirrors import cross-check 9.
export function publishProblem(stats: PublishStats): string | null {
  if (stats.articleCount < 1) return PUBLISH_NEEDS_ARTICLE;
  if (stats.colorCount > 0 && stats.defaultColorCount !== 1)
    return PUBLISH_NEEDS_DEFAULT;
  return null;
}

export function lastArticleProblem(
  status: ProductStatus,
  articleCount: number
): string | null {
  return status === "published" && articleCount <= 1 ? LAST_ARTICLE : null;
}
```

```ts
// lib/admin/schemas.ts
import { z } from "zod";
import { SLUG_PATTERN, slugify } from "@/lib/catalog/slug";

export const PRODUCT_FIELDS = [
  "categoryId",
  "name",
  "slug",
  "subtitle",
  "description",
  "materialId",
  "materialNote",
  "status",
  "sortOrder",
  "seoTitle",
  "seoDescription",
] as const;
export type ProductValues = Record<(typeof PRODUCT_FIELDS)[number], string>;

export const emptyProductValues = (): ProductValues => ({
  categoryId: "",
  name: "",
  slug: "",
  subtitle: "",
  description: "",
  materialId: "",
  materialNote: "",
  status: "draft",
  sortOrder: "0",
  seoTitle: "",
  seoDescription: "",
});

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === "" ? null : v));
export const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Höchstens ${max} Zeichen.`);
export const optionalId = z
  .string()
  .regex(/^([1-9]\d*)?$/, "Ungültige Auswahl.")
  .transform((v) => (v === "" ? null : Number(v)));
export const integer = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}$/, "Bitte eine ganze Zahl eingeben.")
  .transform(Number);

export const productSchema = z.object({
  categoryId: z
    .string()
    .regex(/^[1-9]\d*$/, "Bitte eine Kategorie wählen.")
    .transform(Number),
  name: requiredText(200, "Bitte einen Namen eingeben."),
  slug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  subtitle: optionalText(200),
  description: optionalText(10_000),
  materialId: optionalId,
  materialNote: optionalText(500),
  status: z.enum(["draft", "published", "archived"], {
    message: "Ungültiger Status.",
  }),
  sortOrder: integer,
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
});
export type ProductInput = z.output<typeof productSchema>;

export function withDefaultSlug(values: ProductValues): ProductValues {
  return values.slug.trim() === ""
    ? { ...values, slug: slugify(values.name) }
    : values;
}
```

- [ ] **Step 4: Run** `pnpm vitest run lib/admin && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(admin): write wrapper, error mapping, origin and publish rules, product schema"`

---

### Task 8: Product data access and list filter

Covers: FR-5/SC-5, FR-6, FR-11, FR-12 (app part), Review Focus 1 and 2.

**Files:**

- Create: `lib/admin/filter.ts`, `lib/admin/filter.test.ts`, `lib/admin/products.ts`, `lib/admin/server.ts`, `tests/integration/admin-products.test.ts`, `tests/integration/admin-session.ts`

**Interfaces:**

- Consumes: Task 7 modules; `AdminClient` (Task 4).
- Produces:
  - `type ProductFilter = { categoryId: number | null; status: ProductStatus | null; q: string | null }`, `parseFilter(params: Record<string, string | string[] | undefined>): ProductFilter` (keys `kategorie`, `status`, `q`), `likePattern(q: string): string`
  - `type ProductListItem = { id: number; name: string; slug: string; status: ProductStatus; categoryName: string; categorySlug: string; articleCount: number; updatedAt: string }`
  - `listProducts(client, filter): Promise<Result<ProductListItem[], AdminError>>`
  - `type EditorOptions = { categories: { id: number; name: string }[]; materials: { id: number; code: string; name: string }[]; colors: { id: number; name: string; hexCode: string }[]; attributes: AttributeOption[] }`, `type AttributeOption = { id: number; key: string; label: string; unit: string | null; dataType: "decimal" | "text"; sortOrder: number }`, `loadEditorOptions(client)`
  - `type ArticleEditItem = { id: number; articleNumber: string; name: string | null; description: string | null; note: string | null; materialId: number | null; materialNote: string | null; sortOrder: number; attributes: { attributeId: number; valueDecimal: number | null; valueText: string | null }[]; packaging: { quantity: number; label: string | null }[] }`
  - `type ColorAssignment = { colorId: number; suffix: string | null; isDefault: boolean; sortOrder: number }`
  - `type ProductEditor = { product: { id: number; categoryId: number; categorySlug: string; name: string; slug: string; subtitle: string | null; description: string | null; materialId: number | null; materialNote: string | null; status: ProductStatus; sortOrder: number; seoTitle: string | null; seoDescription: string | null; descriptionOrigin: ContentOrigin; seoOrigin: ContentOrigin }; articles: ArticleEditItem[]; colors: ColorAssignment[]; categoryAttributeIds: number[] }`, `getProductEditor(client, id: number): Promise<Result<ProductEditor, AdminError>>`
  - `toProductValues(product: ProductEditor["product"]): ProductValues`
  - `publishStats(client, productId): Promise<Result<PublishStats, AdminError>>`
  - `saveProduct(client, id: number | null, input: ProductInput): Promise<Result<{ id: number }, AdminError>>`
  - `deleteProduct(client, id: number): Promise<Result<null, AdminError>>`
  - `lib/admin/server.ts` (`server-only`): `writeDeps(client: AdminClient): WriteDeps`, `unwrapAdmin<T>(result: Result<T, AdminError>, context: string): T` (not_found → `notFound()`, else logs context + code and throws `Error("Admin-Daten konnten nicht geladen werden.")`)

- [ ] **Step 1: Write failing tests**

```ts
// lib/admin/filter.test.ts
import { describe, expect, it } from "vitest";
import { likePattern, parseFilter } from "./filter";

describe("parseFilter (Review Focus 2)", () => {
  it("parses valid params", () => {
    expect(
      parseFilter({ kategorie: "2", status: "draft", q: " 99211/80 " })
    ).toEqual({ categoryId: 2, status: "draft", q: "99211/80" });
  });
  it("ignores invalid values and uses the first of repeated params", () => {
    expect(
      parseFilter({ kategorie: ["abc", "1"], status: "foo", q: "" })
    ).toEqual({ categoryId: null, status: null, q: null });
    expect(parseFilter({ kategorie: ["1", "2"] }).categoryId).toBe(1);
  });
  it("caps the search text at 100 characters", () => {
    expect(parseFilter({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("likePattern (Review Focus 1)", () => {
  it("escapes LIKE wildcards and backslashes", () => {
    expect(likePattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});
```

```ts
// tests/integration/admin-session.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const service = () =>
  createClient(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

// Signed-in client for a throwaway user; role "admin" or none.
export async function sessionClient(
  email: string,
  admin: boolean
): Promise<SupabaseClient<Database>> {
  const password = "integration-password-123";
  const svc = service();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) await svc.auth.admin.deleteUser(existing.id);
  await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: admin ? { role: "admin" } : {},
  });
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function deleteUser(email: string): Promise<void> {
  const svc = service();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users.filter((x) => x.email === email))
    await svc.auth.admin.deleteUser(u.id);
}

export async function deleteProductsBySlugPrefix(
  prefix: string
): Promise<void> {
  await service().from("product").delete().like("slug", `${prefix}%`);
}
```

```ts
// tests/integration/admin-products.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteProduct,
  getProductEditor,
  listProducts,
  saveProduct,
} from "@/lib/admin/products";
import { productSchema, emptyProductValues } from "@/lib/admin/schemas";
import {
  deleteProductsBySlugPrefix,
  deleteUser,
  sessionClient,
} from "./admin-session";

const ADMIN = "int-admin-products@example.test";
let admin: SupabaseClient<Database>;
const input = (patch: Record<string, string>) =>
  productSchema.parse({
    ...emptyProductValues(),
    categoryId: "1",
    name: "Int Teil",
    slug: "int-teil",
    ...patch,
  });

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await deleteProductsBySlugPrefix("int-");
  await deleteUser(ADMIN);
});

describe("listProducts (SC-5)", () => {
  it("includes drafts and filters by status and category", async () => {
    const drafts = await listProducts(admin, {
      categoryId: null,
      status: "draft",
      q: null,
    });
    expect(drafts.ok && drafts.value.map((p) => p.slug)).toContain(
      "entwurfsteil"
    );
    const cat2 = await listProducts(admin, {
      categoryId: 2,
      status: null,
      q: null,
    });
    expect(
      cat2.ok && cat2.value.every((p) => p.categorySlug === "sanitaer")
    ).toBe(true);
  });
  it("finds a product by article number and by name", async () => {
    const byNumber = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "99211/80",
    });
    expect(byNumber.ok && byNumber.value.map((p) => p.slug)).toEqual([
      "testrohrschelle",
    ]);
    const byName = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "testkeil",
    });
    expect(byName.ok && byName.value.map((p) => p.slug)).toEqual([
      "testkeil-mit-daempfung",
    ]);
  });
  it.each(["%", "_", "a,b", "x)", "(", "\\"])(
    "treats %s literally (Review Focus 1)",
    async (q) => {
      const result = await listProducts(admin, {
        categoryId: null,
        status: null,
        q,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  );
  it("counts articles", async () => {
    const r = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "testkeil",
    });
    expect(r.ok && r.value[0]?.articleCount).toBe(2);
  });
});

describe("saveProduct / deleteProduct", () => {
  it("creates a draft, maps a taken slug to a conflict and refuses publishing without articles", async () => {
    const created = await saveProduct(admin, null, input({}));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const dup = await saveProduct(admin, null, input({}));
    expect(dup).toEqual({
      ok: false,
      error: { kind: "conflict", field: "slug" },
    });
    const publish = await saveProduct(
      admin,
      created.value.id,
      input({ status: "published" })
    );
    expect(publish.ok).toBe(false);
    if (!publish.ok) expect(publish.error.kind).toBe("invalid");
    const editor = await getProductEditor(admin, created.value.id);
    expect(editor.ok && editor.value.product.status).toBe("draft");
    expect(await deleteProduct(admin, created.value.id)).toEqual({
      ok: true,
      value: null,
    });
  });
  it("refuses deleting a published product", async () => {
    const r = await deleteProduct(admin, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid");
  });
  it("returns not_found for a missing product", async () => {
    expect(await getProductEditor(admin, 999999)).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin/filter.test.ts && pnpm db:test` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/admin/filter.ts
import type { ProductStatus } from "./labels";

export type ProductFilter = {
  categoryId: number | null;
  status: ProductStatus | null;
  q: string | null;
};
type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;
const STATUSES: readonly string[] = ["draft", "published", "archived"];

export function parseFilter(params: Params): ProductFilter {
  const category = first(params.kategorie);
  const status = first(params.status);
  const q = first(params.q)?.trim().slice(0, 100);
  return {
    categoryId:
      category && /^[1-9]\d{0,9}$/.test(category) ? Number(category) : null,
    status:
      status && STATUSES.includes(status) ? (status as ProductStatus) : null,
    q: q ? q : null,
  };
}

// For .ilike(): user text is matched literally (Review Focus 1).
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
```

`lib/admin/products.ts` (`import "server-only"` is not needed — it receives the client; keep it importable by integration tests). Use only parameterised builder calls (`.eq`, `.ilike`, `.in`) — never build `.or()` strings from user input.

```ts
// lib/admin/products.ts
import type { ContentOrigin } from "@/lib/catalog/types";
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";
import { likePattern, type ProductFilter } from "./filter";
import type { ProductStatus } from "./labels";
import { productOrigins } from "./origin";
import {
  DELETE_PUBLISHED,
  publishProblem,
  type PublishStats,
} from "./product-rules";
import type { ProductInput, ProductValues } from "./schemas";

// (types from the Interfaces block above: ProductListItem, AttributeOption,
// EditorOptions, ArticleEditItem, ColorAssignment, ProductEditor — declare and
// export them here exactly as listed)

const PRODUCT_CONFLICTS = { product_category_id_slug_key: "slug" };

export async function listProducts(
  client: AdminClient,
  filter: ProductFilter
): Promise<Result<ProductListItem[], AdminError>> {
  let ids: number[] | null = null;
  if (filter.q !== null) {
    const pattern = likePattern(filter.q);
    const [byName, byNumber] = await Promise.all([
      client.from("product").select("id").ilike("name", pattern),
      client
        .from("article")
        .select("product_id")
        .ilike("article_number", pattern),
    ]);
    if (byName.error) return err(fromPg(byName.error));
    if (byNumber.error) return err(fromPg(byNumber.error));
    ids = [
      ...new Set([
        ...byName.data.map((r) => r.id),
        ...byNumber.data.map((r) => r.product_id),
      ]),
    ];
    if (ids.length === 0) return ok([]);
  }
  let query = client
    .from("product")
    .select(
      "id, name, slug, status, sort_order, updated_at, category!inner(name, slug, sort_order), article!article_product_id_fkey(count)"
    );
  if (filter.categoryId !== null)
    query = query.eq("category_id", filter.categoryId);
  if (filter.status !== null) query = query.eq("status", filter.status);
  if (ids !== null) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) return err(fromPg(error));
  const rows = data
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      categoryName: p.category.name,
      categorySlug: p.category.slug,
      categoryOrder: p.category.sort_order,
      sortOrder: p.sort_order,
      articleCount: p.article[0]?.count ?? 0,
      updatedAt: p.updated_at,
    }))
    .sort(
      (a, b) =>
        a.categoryOrder - b.categoryOrder ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name, "de")
    );
  return ok(rows.map(({ categoryOrder: _c, sortOrder: _s, ...item }) => item));
}
```

If the generated types do not type the `count` aggregate (`article: { count: number }[]`), read it with a narrow runtime check (`typeof x === "object" && x !== null && "count" in x`) instead of a cast to `any`.

`loadEditorOptions(client)`: four parallel selects — `category` (`id, name`, order `sort_order`), `material` (`id, code, name`, order `code`), `color` (`id, name, hex_code`, order `name`), `attribute` (`id, key, label, unit, data_type, sort_order`, order `sort_order`) — mapped to camelCase. Any error → `err(fromPg(error))`.

`getProductEditor(client, id)`:

```ts
const { data, error } = await client
  .from("product")
  .select(
    `id, category_id, name, slug, subtitle, description, material_id, material_note, status, sort_order,
      seo_title, seo_description, description_origin, seo_origin,
      category!inner(slug, category_attribute(attribute_id)),
      article!article_product_id_fkey(id, article_number, name, description, note, material_id, material_note, sort_order,
        article_attribute(attribute_id, value_decimal, value_text),
        article_packaging(quantity, label, sort_order)),
      product_color(color_id, suffix, is_default, sort_order)`
  )
  .eq("id", id)
  .maybeSingle();
if (error) return err(fromPg(error));
if (data === null) return err({ kind: "not_found" });
```

Map to `ProductEditor`: articles sorted by `sort_order` then `article_number`; packaging sorted by `sort_order`; colours sorted by `sort_order`; `categoryAttributeIds` from `category.category_attribute`. `value_decimal` comes back as `number` (numeric → JSON number); keep it as `number | null`.

`toProductValues(product)`: every field as string (`null` → `""`, numbers via `String`).

`publishStats(client, productId)`: two selects with `{ count: "exact", head: true }` on `article` (`product_id = id`) and a select of `is_default` on `product_color` (`product_id = id`) → `{ articleCount, colorCount: rows.length, defaultColorCount: rows.filter(r => r.is_default).length }`.

`saveProduct(client, id, input)`:

```ts
export async function saveProduct(
  client: AdminClient,
  id: number | null,
  input: ProductInput
): Promise<Result<{ id: number }, AdminError>> {
  const fields = {
    category_id: input.categoryId,
    name: input.name,
    slug: input.slug,
    subtitle: input.subtitle,
    description: input.description,
    material_id: input.materialId,
    material_note: input.materialNote,
    status: input.status,
    sort_order: input.sortOrder,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
  };
  const next = {
    description: input.description,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };

  if (id === null) {
    if (input.status === "published")
      return err({ kind: "invalid", message: PUBLISH_NEEDS_ARTICLE });
    const { data, error } = await client
      .from("product")
      .insert({ ...fields, ...productOrigins(null, next) })
      .select("id")
      .single();
    if (error) return err(fromPg(error, PRODUCT_CONFLICTS));
    return ok({ id: data.id });
  }

  const { data: prev, error: prevError } = await client
    .from("product")
    .select(
      "description, seo_title, seo_description, description_origin, seo_origin"
    )
    .eq("id", id)
    .maybeSingle();
  if (prevError) return err(fromPg(prevError));
  if (prev === null) return err({ kind: "not_found" });
  if (input.status === "published") {
    const stats = await publishStats(client, id);
    if (!stats.ok) return stats;
    const problem = publishProblem(stats.value);
    if (problem) return err({ kind: "invalid", message: problem });
  }
  const origins = productOrigins(
    {
      description: prev.description,
      seoTitle: prev.seo_title,
      seoDescription: prev.seo_description,
      descriptionOrigin: prev.description_origin,
      seoOrigin: prev.seo_origin,
    },
    next
  );
  const { data, error } = await client
    .from("product")
    .update({ ...fields, ...origins })
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, PRODUCT_CONFLICTS));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok({ id });
}
```

(Import `PUBLISH_NEEDS_ARTICLE` from `./product-rules`.)

`deleteProduct(client, id)`: select `status` (`maybeSingle`) → `null` → `not_found`; `published` → `err({ kind: "invalid", message: DELETE_PUBLISHED })`; else `.delete().eq("id", id).select("id")`; 0 rows → `not_found`; ok → `ok(null)`.

```ts
// lib/admin/server.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import type { Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { checkAdmin } from "./auth";
import type { AdminError } from "./errors";
import type { WriteDeps } from "./write";

// D11: the catalog is small; revalidating every page is cheaper than tracking
// which category, related-product and search pages a change touches.
export function writeDeps(client: AdminClient): WriteDeps {
  return {
    check: () => checkAdmin(client),
    revalidate: () => revalidatePath("/", "layout"),
    logError: (context, code) => console.error(context, code ?? "unknown"),
  };
}

export function unwrapAdmin<T>(
  result: Result<T, AdminError>,
  context: string
): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") notFound();
  console.error(
    `[admin] ${context} failed:`,
    result.error.kind,
    result.error.kind === "db_error" ? result.error.code : ""
  );
  throw new Error("Admin-Daten konnten nicht geladen werden.");
}
```

- [ ] **Step 4: Run** `pnpm vitest run lib/admin && pnpm db:test && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(admin): product data access and list filter"`

---

### Task 9: Product list, create/edit form and product actions

Covers: FR-5, FR-6, FR-11, FR-12 (UI), D6, D10.

**Files:**

- Create: `app/admin/(protected)/produkte/page.tsx`, `app/admin/(protected)/produkte/neu/page.tsx`, `app/admin/(protected)/produkte/[id]/page.tsx`, `app/admin/(protected)/produkte/actions.ts`, `components/admin/product-list.tsx`, `components/admin/product-form.tsx`, `components/admin/product-form.test.tsx`, `components/admin/delete-product-button.tsx`, `components/admin/status-badge.tsx`

**Interfaces:**

- Consumes: Tasks 4, 7, 8.
- Produces (`actions.ts`, `"use server"`):
  - `saveProductAction(prev: FormState<ProductValues>, formData: FormData): Promise<FormState<ProductValues>>` — hidden field `id` (empty on create); on create success `redirect("/admin/produkte/<id>")`.
  - `deleteProductAction(prev: FormState<null>, formData: FormData): Promise<FormState<null>>` — field `id`; on success `redirect("/admin/produkte")`.
  - Helper in the same file: `async function runWrite<T, V>(values: V, context: string, write: (client: AdminClient) => Promise<Result<T, AdminError>>): Promise<{ state: FormState<V> } | { value: T }>` — creates the session client, calls `adminWrite(writeDeps(client), …)`, redirects to `LOGIN_PATH` on `anonymous`, maps errors with `errorState`. Tasks 10 and 11 add their actions to this file and use this helper.
  - `ProductForm({ action, deleteAction, initial, options, productId, savedStatus })` client component.

- [ ] **Step 1: Write the failing component test**

```tsx
// components/admin/product-form.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyProductValues } from "@/lib/admin/schemas";
import { ProductForm } from "./product-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const options = {
  categories: [{ id: 1, name: "Möbelteile" }],
  materials: [{ id: 1, code: "PA-6", name: "Polyamid 6" }],
  colors: [],
  attributes: [],
};
const noop = async <S,>(s: S) => s;

describe("ProductForm (SC-6, SC-12)", () => {
  it("fills the slug from the name on create until the slug is edited", () => {
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
      />
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Schließkeil 8 mm" },
    });
    expect(screen.getByLabelText("Slug")).toHaveValue("schliesskeil-8-mm");
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "eigener-slug" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Anders" },
    });
    expect(screen.getByLabelText("Slug")).toHaveValue("eigener-slug");
  });
  it("shows the URL hint and no delete button for a published product", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
      status: "published",
    };
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="published"
      />
    );
    expect(
      screen.getByText(/ändert die öffentliche Adresse/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Produkt löschen" })
    ).toBeNull();
  });
  it("offers delete for a draft", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
    };
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="draft"
      />
    );
    expect(
      screen.getByRole("button", { name: "Produkt löschen" })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run components/admin/product-form.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement actions**

```ts
// app/admin/(protected)/produkte/actions.ts
"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
import type { AdminError } from "@/lib/admin/errors";
import {
  errorState,
  readFields,
  zodFieldErrors,
  type FormState,
} from "@/lib/admin/form";
import { deleteProduct, saveProduct } from "@/lib/admin/products";
import {
  PRODUCT_FIELDS,
  productSchema,
  withDefaultSlug,
  type ProductValues,
} from "@/lib/admin/schemas";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";

const idFrom = (formData: FormData, name = "id"): number | null => {
  const raw = formData.get(name);
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
};

async function runWrite<T, V>(
  values: V,
  context: string,
  write: (client: AdminClient) => Promise<Result<T, AdminError>>
): Promise<{ state: FormState<V> } | { value: T }> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    write(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH); // Review Focus 3
  if (!outcome.result.ok)
    return { state: errorState(values, outcome.result.error) };
  return { value: outcome.result.value };
}

export async function saveProductAction(
  _prev: FormState<ProductValues>,
  formData: FormData
): Promise<FormState<ProductValues>> {
  const values = withDefaultSlug(readFields(formData, PRODUCT_FIELDS));
  const parsed = productSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const id = idFrom(formData);
  const done = await runWrite(values, "[admin] save product", (client) =>
    saveProduct(client, id, parsed.data)
  );
  if ("state" in done) return done.state;
  if (id === null) redirect(`/admin/produkte/${done.value.id}`);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteProductAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const id = idFrom(formData);
  if (id === null)
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(null, "[admin] delete product", (client) =>
    deleteProduct(client, id)
  );
  if ("state" in done) return done.state;
  redirect("/admin/produkte");
}
```

`redirect()` throws; never wrap it in `try/catch`.

- [ ] **Step 4: Implement components and pages**

`components/admin/status-badge.tsx`: `StatusBadge({ status })` → shadcn `Badge` with `STATUS_LABEL[status]`; variant `default` for published, `secondary` for draft, `outline` for archived.

`components/admin/product-list.tsx` (server component): props `{ items: ProductListItem[]; filter: ProductFilter; categories: EditorOptions["categories"] }`. Renders:

- a `<form method="get" role="search" aria-label="Produkte filtern">` with native `<select name="kategorie">` (option "Alle Kategorien" value ""), `<select name="status">` ("Alle Status", then `STATUS_LABEL` entries), `<Input name="q" type="search">` labelled "Name oder Artikelnummer", `<Button type="submit">Filtern</Button>`; current filter values preselected; every control has a visible `<Label>`.
- a shadcn `Table` with caption "Produkte" (visually hidden via `sr-only` is fine), columns Name (link to `/admin/produkte/${id}`), Kategorie, Status (`StatusBadge`), Artikel (count), Geändert (`new Date(updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" })`).
- empty state: "Keine Produkte gefunden."

```tsx
// app/admin/(protected)/produkte/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ProductList } from "@/components/admin/product-list";
import { Button } from "@/components/ui/button";
import { parseFilter } from "@/lib/admin/filter";
import { listProducts, loadEditorOptions } from "@/lib/admin/products";
import { unwrapAdmin } from "@/lib/admin/server";
import { createSessionSupabase } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Produkte" };

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/produkte">) {
  const filter = parseFilter(await searchParams);
  const client = await createSessionSupabase();
  const [list, options] = await Promise.all([
    listProducts(client, filter),
    loadEditorOptions(client),
  ]);
  const items = unwrapAdmin(list, "product list");
  const { categories } = unwrapAdmin(options, "editor options");
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Produkte</h1>
        <Button asChild>
          <Link href="/admin/produkte/neu">Neues Produkt</Link>
        </Button>
      </div>
      <ProductList items={items} filter={filter} categories={categories} />
    </>
  );
}
```

`app/admin/(protected)/produkte/neu/page.tsx`: loads `loadEditorOptions`, renders `<h1>Neues Produkt</h1>` and `<ProductForm action={saveProductAction} deleteAction={deleteProductAction} initial={emptyProductValues()} options={options} productId={null} savedStatus={null} />`.

`app/admin/(protected)/produkte/[id]/page.tsx`: `const { id } = await params;` — if `!/^[1-9]\d{0,9}$/.test(id)` → `notFound()`. Loads `getProductEditor` and `loadEditorOptions` in parallel, `unwrapAdmin` both. Renders: back link "← Alle Produkte", `<h1>{product.name}</h1>`, `StatusBadge`, a link "Öffentliche Seite ansehen" to `productPath(product.categorySlug, product.slug)` (from `@/lib/catalog/anchors`) only when `status === "published"`, then `<ProductForm … initial={toProductValues(product)} productId={product.id} savedStatus={product.status} />`. Tasks 10 and 11 add the article and colour sections below the form. `generateMetadata` returns `{ title: product.name }` (use the same loader; wrap the loader in React `cache()` inside the page module so it runs once).

`components/admin/product-form.tsx` (`"use client"`):

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/admin/form";
import { STATUS_LABEL, type ProductStatus } from "@/lib/admin/labels";
import type { EditorOptions } from "@/lib/admin/products";
import type { ProductValues } from "@/lib/admin/schemas";
import { slugify } from "@/lib/catalog/slug";
import { DeleteProductButton } from "./delete-product-button";
import { describedBy, Field, selectClass } from "./field";

type Props = {
  action: (
    prev: FormState<ProductValues>,
    formData: FormData
  ) => Promise<FormState<ProductValues>>;
  deleteAction: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
  initial: ProductValues;
  options: EditorOptions;
  productId: number | null;
  savedStatus: ProductStatus | null;
};

export function ProductForm({
  action,
  deleteAction,
  initial,
  options,
  productId,
  savedStatus,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    values: initial,
    fieldErrors: {},
    formError: null,
  } satisfies FormState<ProductValues>);
  const [name, setName] = useState(state.values.name);
  const [slug, setSlug] = useState(state.values.slug);
  const slugTouched = useRef(productId !== null);
  const seen = useRef(state);

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") toast.success("Gespeichert.");
  }, [state]);

  const v = state.values;
  const e = state.fieldErrors;
  const text = (
    id: keyof ProductValues,
    label: string,
    hint?: string,
    multiline = false
  ) => {
    const props = {
      id,
      name: id,
      defaultValue: v[id],
      "aria-invalid": Boolean(e[id]),
      "aria-describedby": describedBy(id, e[id], hint),
    };
    return (
      <Field id={id} label={label} error={e[id]} hint={hint}>
        {multiline ? <Textarea rows={6} {...props} /> : <Input {...props} />}
      </Field>
    );
  };

  return (
    <div className="mt-6 grid gap-6">
      <form
        action={formAction}
        className="grid gap-4 md:grid-cols-2"
        noValidate
      >
        <input type="hidden" name="id" value={productId ?? ""} />
        {state.formError ? (
          <p
            role="alert"
            className="md:col-span-2 rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
          >
            {state.formError}
          </p>
        ) : null}
        <Field id="categoryId" label="Kategorie" error={e.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={v.categoryId}
            className={selectClass}
            aria-invalid={Boolean(e.categoryId)}
            aria-describedby={describedBy("categoryId", e.categoryId)}
          >
            <option value="">Bitte wählen</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="status" label="Status" error={e.status}>
          <select
            id="status"
            name="status"
            defaultValue={v.status}
            className={selectClass}
          >
            {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="name" label="Name" error={e.name}>
          <Input
            id="name"
            name="name"
            value={name}
            aria-invalid={Boolean(e.name)}
            aria-describedby={describedBy("name", e.name)}
            onChange={(ev) => {
              setName(ev.target.value);
              if (!slugTouched.current) setSlug(slugify(ev.target.value));
            }}
          />
        </Field>
        <Field
          id="slug"
          label="Slug"
          error={e.slug}
          hint={
            productId !== null
              ? "Eine Änderung von Slug oder Kategorie ändert die öffentliche Adresse."
              : "Wird aus dem Namen erzeugt."
          }
        >
          <Input
            id="slug"
            name="slug"
            value={slug}
            aria-invalid={Boolean(e.slug)}
            aria-describedby={describedBy("slug", e.slug, "x")}
            onChange={(ev) => {
              slugTouched.current = true;
              setSlug(ev.target.value);
            }}
          />
        </Field>
        {text("subtitle", "Untertitel")}
        {text("sortOrder", "Reihenfolge")}
        <div className="md:col-span-2">
          {text("description", "Beschreibung (Markdown)", undefined, true)}
        </div>
        <Field id="materialId" label="Material" error={e.materialId}>
          <select
            id="materialId"
            name="materialId"
            defaultValue={v.materialId}
            className={selectClass}
          >
            <option value="">Kein Material</option>
            {options.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} – {m.name}
              </option>
            ))}
          </select>
        </Field>
        {text("materialNote", "Materialhinweis")}
        {text(
          "seoTitle",
          "SEO-Titel",
          "Höchstens 70 Zeichen; leer = automatisch."
        )}
        {text(
          "seoDescription",
          "SEO-Beschreibung",
          "Höchstens 160 Zeichen; leer = automatisch."
        )}
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Speichern …"
              : productId === null
                ? "Produkt anlegen"
                : "Speichern"}
          </Button>
        </div>
      </form>
      {productId !== null &&
      savedStatus !== null &&
      savedStatus !== "published" ? (
        <DeleteProductButton
          action={deleteAction}
          productId={productId}
          productName={initial.name}
        />
      ) : null}
    </div>
  );
}
```

Fix the `aria-describedby` of the slug input to pass the actual hint text (`describedBy("slug", e.slug, hintText)`); the `"x"` above only marks that a hint exists — compute `hintText` once and reuse it for `Field` and the input.

`components/admin/delete-product-button.tsx` (`"use client"`): shadcn `AlertDialog`; trigger `Button variant="destructive"` "Produkt löschen"; content title "Produkt löschen?", description `„{productName}“ und alle Artikel, Farbzuordnungen und Zubehör-Verknüpfungen werden endgültig gelöscht.`; footer "Abbrechen" and a `<form action={formAction}>` with hidden `id` and a destructive submit "Endgültig löschen"; `useActionState(action, { status: "idle", values: null, fieldErrors: {}, formError: null })`; shows `state.formError` in the dialog with `role="alert"`.

- [ ] **Step 5: Run** `pnpm vitest run components/admin && pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm build` — Expected: PASS.

- [ ] **Step 6: Commit** `git commit -m "feat(admin): product list, create and edit form, delete for drafts"`

---

### Task 10: Articles — schema, data access, dialog, actions

Covers: FR-9/SC-9, D8, Review Focus 4 and 5.

**Files:**

- Create: `lib/admin/article-schema.ts`, `lib/admin/article-schema.test.ts`, `lib/admin/articles.ts`, `components/admin/article-section.tsx`, `components/admin/article-dialog.tsx`, `components/admin/article-dialog.test.tsx`, `components/admin/delete-article-button.tsx`, `tests/integration/admin-articles.test.ts`
- Modify: `app/admin/(protected)/produkte/actions.ts`, `app/admin/(protected)/produkte/[id]/page.tsx`

**Interfaces:**

- Consumes: `AttributeOption`, `ArticleEditItem`, `EditorOptions` (Task 8); `FormState`, `zodFieldErrors`, `runWrite`, `idFrom` (Tasks 7/9); `lastArticleProblem` (Task 7).
- Produces:
  - `type ArticleValues = { id: string; productId: string; articleNumber: string; name: string; description: string; note: string; materialId: string; materialNote: string; sortOrder: string; attributes: Record<string, string>; packaging: { quantity: string; label: string }[] }`
  - `readArticleForm(formData: FormData): ArticleValues` — attribute inputs are named `attr:<attributeId>`, pack rows `packQuantity` / `packLabel` (repeated, read with `getAll`)
  - `type ArticleInput = { id: number | null; productId: number; articleNumber: string; name: string | null; description: string | null; note: string | null; materialId: number | null; materialNote: string | null; sortOrder: number; attributes: { attributeId: number; valueDecimal: number | null; valueText: string | null }[]; packaging: { quantity: number; label: string | null }[] }`
  - `parseArticle(values: ArticleValues, types: ReadonlyMap<number, "decimal" | "text">): { ok: true; value: ArticleInput } | { ok: false; fieldErrors: FieldErrors }`
  - `articleValuesFrom(article: ArticleEditItem | null, productId: number): ArticleValues` (decimal shown with a comma: `String(v).replace(".", ",")`)
  - `attributeInputsFor(categoryAttributeIds: readonly number[], article: ArticleEditItem | null, all: readonly AttributeOption[]): AttributeOption[]`
  - `saveArticle(client, input: ArticleInput): Promise<Result<{ id: number }, AdminError>>`, `deleteArticle(client, productId: number, articleId: number): Promise<Result<null, AdminError>>`, `loadAttributeTypes(client): Promise<Result<Map<number, "decimal" | "text">, AdminError>>`
  - Actions: `saveArticleAction(prev: FormState<ArticleValues>, formData): Promise<FormState<ArticleValues>>`, `deleteArticleAction(prev: FormState<null>, formData): Promise<FormState<null>>` (fields `productId`, `articleId`)

- [ ] **Step 1: Write failing tests**

```ts
// lib/admin/article-schema.test.ts
import { describe, expect, it } from "vitest";
import type { AttributeOption } from "./products";
import {
  attributeInputsFor,
  parseArticle,
  type ArticleValues,
} from "./article-schema";

const types = new Map<number, "decimal" | "text">([
  [1, "decimal"],
  [3, "text"],
]);
const base: ArticleValues = {
  id: "",
  productId: "4",
  articleNumber: " 6211/80 ",
  name: "",
  description: "",
  note: "",
  materialId: "",
  materialNote: "",
  sortOrder: "0",
  attributes: {},
  packaging: [],
};

describe("parseArticle (SC-9)", () => {
  it.each(["8,5", "8.5"])("parses %s as 8.5", (raw) => {
    const r = parseArticle({ ...base, attributes: { "1": raw } }, types);
    expect(r.ok && r.value.attributes).toEqual([
      { attributeId: 1, valueDecimal: 8.5, valueText: null },
    ]);
  });
  it("keeps the article number as typed, only trimmed", () => {
    const r = parseArticle(base, types);
    expect(r.ok && r.value.articleNumber).toBe("6211/80");
  });
  it("drops empty attribute inputs and empty pack rows", () => {
    const r = parseArticle(
      {
        ...base,
        attributes: { "1": " ", "3": "glatt" },
        packaging: [
          { quantity: "", label: "" },
          { quantity: "250", label: "Karton" },
        ],
      },
      types
    );
    expect(r.ok && r.value).toMatchObject({
      attributes: [{ attributeId: 3, valueDecimal: null, valueText: "glatt" }],
      packaging: [{ quantity: 250, label: "Karton" }],
    });
  });
  it.each([
    [
      { articleNumber: "  " },
      "articleNumber",
      "Bitte eine Artikelnummer eingeben.",
    ],
    [
      { attributes: { "1": "acht" } },
      "attr:1",
      "Bitte eine Zahl eingeben, z. B. 8,5.",
    ],
    [{ attributes: { "99": "1" } }, "attr:99", "Unbekanntes Attribut."],
    [
      { packaging: [{ quantity: "0", label: "" }] },
      "packaging.0",
      "Bitte eine positive ganze Zahl eingeben.",
    ],
    [
      { packaging: [{ quantity: "-5", label: "" }] },
      "packaging.0",
      "Bitte eine positive ganze Zahl eingeben.",
    ],
  ])("rejects %o", (patch, field, message) => {
    const r = parseArticle({ ...base, ...patch } as ArticleValues, types);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[field]).toBe(message);
  });
});

describe("attributeInputsFor (Review Focus 4)", () => {
  const all: AttributeOption[] = [
    {
      id: 1,
      key: "height",
      label: "Höhe",
      unit: "mm",
      dataType: "decimal",
      sortOrder: 0,
    },
    {
      id: 2,
      key: "pipe_diameter",
      label: "für Rohr Ø",
      unit: "mm",
      dataType: "decimal",
      sortOrder: 1,
    },
    {
      id: 3,
      key: "surface",
      label: "Oberfläche",
      unit: null,
      dataType: "text",
      sortOrder: 2,
    },
  ];
  it("shows the category's attributes plus attributes the article already has", () => {
    const article = {
      id: 1,
      articleNumber: "1",
      name: null,
      description: null,
      note: null,
      materialId: null,
      materialNote: null,
      sortOrder: 0,
      attributes: [{ attributeId: 1, valueDecimal: 8, valueText: null }],
      packaging: [],
    };
    expect(attributeInputsFor([2], article, all).map((a) => a.id)).toEqual([
      1, 2,
    ]);
    expect(attributeInputsFor([3, 1], null, all).map((a) => a.id)).toEqual([
      1, 3,
    ]);
  });
});
```

```tsx
// components/admin/article-dialog.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArticleDialog } from "./article-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const noop = async <S,>(s: S) => s;
const article = {
  id: 9,
  articleNumber: "99010",
  name: "Testkeil 8 mm",
  description: null,
  note: null,
  materialId: null,
  materialNote: null,
  sortOrder: 0,
  attributes: [],
  packaging: [],
};

describe("ArticleDialog (SC-9)", () => {
  it("makes the article number read-only when editing", () => {
    render(
      <ArticleDialog
        action={noop}
        productId={1}
        article={article}
        attributes={[]}
        materials={[]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Artikel 99010 bearbeiten" })
    );
    expect(screen.getByLabelText("Artikelnummer")).toHaveAttribute("readonly");
  });
  it("lets the number be typed when creating", () => {
    render(
      <ArticleDialog
        action={noop}
        productId={1}
        article={null}
        attributes={[]}
        materials={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Artikel hinzufügen" }));
    expect(screen.getByLabelText("Artikelnummer")).not.toHaveAttribute(
      "readonly"
    );
  });
});
```

```ts
// tests/integration/admin-articles.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { deleteArticle, saveArticle } from "@/lib/admin/articles";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-articles@example.test";
let admin: SupabaseClient<Database>;
const input = {
  id: null,
  productId: 4,
  articleNumber: "INT-1",
  name: null,
  description: null,
  note: null,
  materialId: null,
  materialNote: null,
  sortOrder: 5,
  attributes: [],
  packaging: [],
};

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await admin.from("article").delete().eq("article_number", "INT-1");
  await deleteUser(ADMIN);
});

describe("articles", () => {
  it("maps a taken number to a field conflict", async () => {
    expect(
      await saveArticle(admin, { ...input, articleNumber: "99010" })
    ).toEqual({
      ok: false,
      error: { kind: "conflict", field: "articleNumber" },
    });
  });
  it("refuses deleting the last article of a published product", async () => {
    const r = await deleteArticle(admin, 3, 4); // product 3 "testabdeckung" has one article (id 4)
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid");
  });
  it("saves and deletes an article of a draft", async () => {
    const saved = await saveArticle(admin, input);
    expect(saved.ok).toBe(true);
    if (saved.ok)
      expect(await deleteArticle(admin, 4, saved.value.id)).toEqual({
        ok: true,
        value: null,
      });
  });
  it("returns not_found when the article is gone (Review Focus 5)", async () => {
    expect(await saveArticle(admin, { ...input, id: 999999 })).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin/article-schema.test.ts components/admin/article-dialog.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `lib/admin/article-schema.ts`**

```ts
import { z } from "zod";
import type { FieldErrors } from "./form";
import type { ArticleEditItem, AttributeOption } from "./products";
import { integer, optionalId, optionalText, requiredText } from "./schemas";

export type ArticleValues = {
  id: string;
  productId: string;
  articleNumber: string;
  name: string;
  description: string;
  note: string;
  materialId: string;
  materialNote: string;
  sortOrder: string;
  attributes: Record<string, string>;
  packaging: { quantity: string; label: string }[];
};
export type ArticleInput = {/* as in Interfaces */};

const DECIMAL = /^\d{1,7}([.,]\d{1,3})?$/;
const QUANTITY = /^[1-9]\d{0,6}$/;

const baseSchema = z.object({
  id: optionalId,
  productId: z
    .string()
    .regex(/^[1-9]\d*$/, "Ungültiges Produkt.")
    .transform(Number),
  articleNumber: requiredText(40, "Bitte eine Artikelnummer eingeben."),
  name: optionalText(200),
  description: optionalText(5_000),
  note: optionalText(500),
  materialId: optionalId,
  materialNote: optionalText(500),
  sortOrder: integer,
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readArticleForm(formData: FormData): ArticleValues {
  const attributes: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attr:") && typeof value === "string")
      attributes[key.slice(5)] = value;
  }
  const quantities = formData.getAll("packQuantity").map(str);
  const labels = formData.getAll("packLabel").map(str);
  return {
    id: str(formData.get("id")),
    productId: str(formData.get("productId")),
    articleNumber: str(formData.get("articleNumber")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    note: str(formData.get("note")),
    materialId: str(formData.get("materialId")),
    materialNote: str(formData.get("materialNote")),
    sortOrder: str(formData.get("sortOrder")) || "0",
    attributes,
    packaging: quantities.map((quantity, i) => ({
      quantity,
      label: labels[i] ?? "",
    })),
  };
}

export function parseArticle(
  values: ArticleValues,
  types: ReadonlyMap<number, "decimal" | "text">
): { ok: true; value: ArticleInput } | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  const base = baseSchema.safeParse(values);
  if (!base.success)
    for (const issue of base.error.issues)
      errors[String(issue.path[0])] ??= issue.message;

  const attributes: ArticleInput["attributes"] = [];
  for (const [key, raw] of Object.entries(values.attributes)) {
    const id = Number(key);
    const type = types.get(id);
    const value = raw.trim();
    if (type === undefined) {
      errors[`attr:${key}`] = "Unbekanntes Attribut.";
      continue;
    }
    if (value === "") continue;
    if (type === "decimal") {
      if (!DECIMAL.test(value)) {
        errors[`attr:${key}`] = "Bitte eine Zahl eingeben, z. B. 8,5.";
        continue;
      }
      attributes.push({
        attributeId: id,
        valueDecimal: Number(value.replace(",", ".")),
        valueText: null,
      });
    } else if (value.length > 200) {
      errors[`attr:${key}`] = "Höchstens 200 Zeichen.";
    } else {
      attributes.push({
        attributeId: id,
        valueDecimal: null,
        valueText: value,
      });
    }
  }

  const packaging: ArticleInput["packaging"] = [];
  values.packaging.forEach((row, i) => {
    const quantity = row.quantity.trim();
    const label = row.label.trim();
    if (quantity === "" && label === "") return;
    if (!QUANTITY.test(quantity)) {
      errors[`packaging.${i}`] = "Bitte eine positive ganze Zahl eingeben.";
      return;
    }
    if (label.length > 50) {
      errors[`packaging.${i}`] = "Bezeichnung höchstens 50 Zeichen.";
      return;
    }
    packaging.push({
      quantity: Number(quantity),
      label: label === "" ? null : label,
    });
  });

  if (!base.success || Object.keys(errors).length > 0)
    return { ok: false, fieldErrors: errors };
  attributes.sort((a, b) => a.attributeId - b.attributeId);
  return { ok: true, value: { ...base.data, attributes, packaging } };
}

export function attributeInputsFor(
  categoryAttributeIds: readonly number[],
  article: ArticleEditItem | null,
  all: readonly AttributeOption[]
): AttributeOption[] {
  const ids = new Set([
    ...categoryAttributeIds,
    ...(article?.attributes.map((a) => a.attributeId) ?? []),
  ]);
  return all
    .filter((a) => ids.has(a.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function articleValuesFrom(
  article: ArticleEditItem | null,
  productId: number
): ArticleValues {
  /* map every field to string; decimals with comma; packaging rows as strings */
}
```

Write `articleValuesFrom` fully: `id: article ? String(article.id) : ""`, text fields `?? ""`, `sortOrder: String(article?.sortOrder ?? 0)`, `attributes` from `article.attributes` keyed by `String(attributeId)` with `valueDecimal !== null ? String(valueDecimal).replace(".", ",") : valueText ?? ""`, `packaging` mapped to `{ quantity: String(q), label: label ?? "" }`. The `ArticleInput` type is the one listed under Interfaces — write it out, no placeholder comment.

- [ ] **Step 4: Implement `lib/admin/articles.ts`**

```ts
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import type { ArticleInput } from "./article-schema";
import { fromPg, type AdminError } from "./errors";
import { lastArticleProblem } from "./product-rules";

const ARTICLE_CONFLICTS = { article_article_number_key: "articleNumber" };

export async function saveArticle(
  client: AdminClient,
  input: ArticleInput
): Promise<Result<{ id: number }, AdminError>> {
  const { data, error } = await client.rpc("admin_save_article", {
    payload: {
      id: input.id,
      product_id: input.productId,
      article_number: input.articleNumber,
      name: input.name,
      description: input.description,
      note: input.note,
      material_id: input.materialId,
      material_note: input.materialNote,
      sort_order: input.sortOrder,
      attributes: input.attributes.map((a) => ({
        attribute_id: a.attributeId,
        value_decimal: a.valueDecimal,
        value_text: a.valueText,
      })),
      packaging: input.packaging.map((p) => ({
        quantity: p.quantity,
        label: p.label,
      })),
    },
  });
  if (error) return err(fromPg(error, ARTICLE_CONFLICTS));
  return ok({ id: data });
}

export async function deleteArticle(
  client: AdminClient,
  productId: number,
  articleId: number
): Promise<Result<null, AdminError>> {
  const [product, count] = await Promise.all([
    client.from("product").select("status").eq("id", productId).maybeSingle(),
    client
      .from("article")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);
  if (product.error) return err(fromPg(product.error));
  if (count.error) return err(fromPg(count.error));
  if (product.data === null) return err({ kind: "not_found" });
  const problem = lastArticleProblem(product.data.status, count.count ?? 0);
  if (problem) return err({ kind: "invalid", message: problem });
  const { data, error } = await client
    .from("article")
    .delete()
    .eq("id", articleId)
    .eq("product_id", productId)
    .select("id");
  if (error) return err(fromPg(error));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function loadAttributeTypes(
  client: AdminClient
): Promise<Result<Map<number, "decimal" | "text">, AdminError>> {
  const { data, error } = await client
    .from("attribute")
    .select("id, data_type");
  if (error) return err(fromPg(error));
  return ok(new Map(data.map((a) => [a.id, a.data_type])));
}
```

If the generated RPC arg type is `Json`, the object literal is assignable; if `payload` is typed narrower, build it as `Json` via `satisfies Json` (import `Json` from `database.types.ts`).

- [ ] **Step 5: Actions**

Append to `app/admin/(protected)/produkte/actions.ts`:

```ts
export async function saveArticleAction(
  _prev: FormState<ArticleValues>,
  formData: FormData
): Promise<FormState<ArticleValues>> {
  const values = readArticleForm(formData);
  const client = await createSessionSupabase();
  const types = await loadAttributeTypes(client);
  if (!types.ok) return errorState(values, types.error);
  const parsed = parseArticle(values, types.value);
  if (!parsed.ok)
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  const done = await runWrite(values, "[admin] save article", (c) =>
    saveArticle(c, parsed.value)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteArticleAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const productId = idFrom(formData, "productId");
  const articleId = idFrom(formData, "articleId");
  if (productId === null || articleId === null)
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const done = await runWrite(null, "[admin] delete article", (c) =>
    deleteArticle(c, productId, articleId)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}
```

(Add the imports for `readArticleForm`, `parseArticle`, `ArticleValues`, `saveArticle`, `deleteArticle`, `loadAttributeTypes`.)

- [ ] **Step 6: Components**

`components/admin/article-dialog.tsx` (`"use client"`): props `{ action, productId: number, article: ArticleEditItem | null, attributes: AttributeOption[], materials: EditorOptions["materials"] }`. Trigger button: `article === null` → "Artikel hinzufügen"; else a small outline button with visible text "Bearbeiten" and `aria-label={`Artikel ${article.articleNumber} bearbeiten`}`. On open, render `<ArticleForm key={openCount} …/>` (increment `openCount` on every open so stale state is dropped). `ArticleForm` uses `useActionState(action, idleState(articleValuesFrom(article, productId)))`; on `status === "saved"` → `toast.success("Artikel gespeichert.")` and close the dialog (via `onSaved` callback). Fields (all with `Field`, `aria-invalid`, `aria-describedby`):

- hidden `id`, `productId`
- "Artikelnummer" (`readOnly` when `article !== null`, hint "Kann nach dem Anlegen nicht mehr geändert werden." when editing)
- "Name", "Beschreibung" (Textarea), "Hinweis", "Material" (select with "Wie Produkt" = ""), "Materialhinweis", "Reihenfolge"
- one input per `attributes` entry: name `attr:<id>`, label `${label}${unit ? ` (${unit})` : ""}`, `inputMode="decimal"` for decimals, error key `attr:<id>`
- fieldset "Verpackungseinheiten" (`<legend>`): rows kept in `useState` from `values.packaging` (at least one empty row); each row `packQuantity` (label "Menge", `inputMode="numeric"`) and `packLabel` (label "Bezeichnung (optional)"), a "Entfernen" button per row and "Weitere Einheit" to add; error key `packaging.<i>` under the row. Input ids must be unique per row (`pack-q-${i}`).
- form-level `formError` with `role="alert"`; submit "Speichern".
  Dialog title: "Artikel hinzufügen" / `Artikel ${articleNumber} bearbeiten`.

`components/admin/delete-article-button.tsx`: same pattern as `DeleteProductButton` (AlertDialog; trigger text "Löschen", `aria-label={`Artikel ${articleNumber} löschen`}`; hidden `productId` and `articleId`; shows `formError` with `role="alert"`; on saved → `toast.success("Artikel gelöscht.")`).

`components/admin/article-section.tsx` (server component): props `{ productId, articles, categoryAttributeIds, options, saveAction, deleteAction }`. `<section aria-labelledby="articles-heading">` with `<h2 id="articles-heading">Artikel</h2>`, the add dialog, and a `Table` (caption "Artikel"): Nummer, Name, Attribute (e.g. `Höhe 8,5 mm` joined by ", "; look up labels in `options.attributes`), Verpackung (quantities joined by " / "), Aktionen (edit dialog with `attributeInputsFor(categoryAttributeIds, article, options.attributes)`, delete button). Empty: "Noch keine Artikel.".

In `app/admin/(protected)/produkte/[id]/page.tsx` render `<ArticleSection …/>` below the product form.

- [ ] **Step 7: Run** `pnpm vitest run lib/admin components/admin && pnpm db:test && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 8: Commit** `git commit -m "feat(admin): articles with attributes and pack sizes"`

---

### Task 11: Colour assignments

Covers: FR-10/SC-10 (unit), D9.

**Files:**

- Create: `lib/admin/color-schema.ts`, `lib/admin/color-schema.test.ts`, `lib/admin/colors.ts`, `components/admin/color-section.tsx`
- Modify: `app/admin/(protected)/produkte/actions.ts`, `app/admin/(protected)/produkte/[id]/page.tsx`

**Interfaces:**

- Consumes: `ColorAssignment`, `EditorOptions` (Task 8), `runWrite`, `idFrom` (Task 9).
- Produces:
  - `type ColorValues = { productId: string; rows: { colorId: string; suffix: string; sortOrder: string }[]; defaultColorId: string }`
  - `readColorsForm(formData: FormData): ColorValues` (repeated `colorId`, `suffix`, `sortOrder`; radio `defaultColor`)
  - `parseColors(values: ColorValues): { ok: true; value: { productId: number; rows: ColorAssignment[] } } | { ok: false; fieldErrors: FieldErrors }` — error keys `colors` (set-level) and `rows.<i>.suffix` / `rows.<i>.sortOrder`
  - `colorValuesFrom(productId: number, rows: ColorAssignment[]): ColorValues`
  - `setProductColors(client, productId: number, rows: ColorAssignment[]): Promise<Result<null, AdminError>>`
  - Action `saveColorsAction(prev: FormState<ColorValues>, formData): Promise<FormState<ColorValues>>`
  - Messages `DUPLICATE_COLOR = "Jede Farbe darf nur einmal zugeordnet sein."`, `DUPLICATE_SUFFIX = "Jedes Suffix darf nur einmal vorkommen."`, `NEEDS_ONE_DEFAULT = "Genau eine Farbe muss Standard sein."` (identical to the SQL messages)

- [ ] **Step 1: Write the failing test**

```ts
// lib/admin/color-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_COLOR,
  DUPLICATE_SUFFIX,
  NEEDS_ONE_DEFAULT,
  parseColors,
  type ColorValues,
} from "./color-schema";

const row = (colorId: string, suffix = "", sortOrder = "0") => ({
  colorId,
  suffix,
  sortOrder,
});

describe("parseColors (SC-10)", () => {
  it("accepts a valid set and marks the default", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "1"), row("1", " 2 ", "1")],
      defaultColorId: "3",
    });
    expect(r.ok && r.value.rows).toEqual([
      { colorId: 3, suffix: "1", isDefault: true, sortOrder: 0 },
      { colorId: 1, suffix: "2", isDefault: false, sortOrder: 1 },
    ]);
  });
  it("accepts an empty set", () => {
    expect(
      parseColors({ productId: "1", rows: [], defaultColorId: "" }).ok
    ).toBe(true);
  });
  it.each<[ColorValues, string]>([
    [
      { productId: "1", rows: [row("3"), row("3")], defaultColorId: "3" },
      DUPLICATE_COLOR,
    ],
    [
      {
        productId: "1",
        rows: [row("3", "1"), row("1", "1")],
        defaultColorId: "3",
      },
      DUPLICATE_SUFFIX,
    ],
    [
      { productId: "1", rows: [row("3"), row("1")], defaultColorId: "" },
      NEEDS_ONE_DEFAULT,
    ],
    [
      { productId: "1", rows: [row("3")], defaultColorId: "1" },
      NEEDS_ONE_DEFAULT,
    ],
  ])("reports %#", (values, message) => {
    const r = parseColors(values);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.colors).toBe(message);
  });
  it("limits the suffix to 10 characters", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "x".repeat(11))],
      defaultColorId: "3",
    });
    expect(!r.ok && r.fieldErrors["rows.0.suffix"]).toBe(
      "Höchstens 10 Zeichen."
    );
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/admin/color-schema.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/admin/color-schema.ts
import type { FieldErrors } from "./form";
import type { ColorAssignment } from "./products";

export const DUPLICATE_COLOR = "Jede Farbe darf nur einmal zugeordnet sein.";
export const DUPLICATE_SUFFIX = "Jedes Suffix darf nur einmal vorkommen.";
export const NEEDS_ONE_DEFAULT = "Genau eine Farbe muss Standard sein.";

export type ColorValues = {
  productId: string;
  rows: { colorId: string; suffix: string; sortOrder: string }[];
  defaultColorId: string;
};

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readColorsForm(formData: FormData): ColorValues {
  const ids = formData.getAll("colorId").map(str);
  const suffixes = formData.getAll("suffix").map(str);
  const orders = formData.getAll("sortOrder").map(str);
  return {
    productId: str(formData.get("productId")),
    rows: ids.map((colorId, i) => ({
      colorId,
      suffix: suffixes[i] ?? "",
      sortOrder: orders[i] ?? String(i),
    })),
    defaultColorId: str(formData.get("defaultColor")),
  };
}

export function parseColors(
  values: ColorValues
):
  | { ok: true; value: { productId: number; rows: ColorAssignment[] } }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const rows: ColorAssignment[] = [];
  values.rows.forEach((row, i) => {
    const suffix = row.suffix.trim();
    if (!ID.test(row.colorId)) {
      errors[`rows.${i}.colorId`] = "Bitte eine Farbe wählen.";
      return;
    }
    if (suffix.length > 10) {
      errors[`rows.${i}.suffix`] = "Höchstens 10 Zeichen.";
      return;
    }
    if (!/^-?\d{1,6}$/.test(row.sortOrder.trim())) {
      errors[`rows.${i}.sortOrder`] = "Bitte eine ganze Zahl eingeben.";
      return;
    }
    rows.push({
      colorId: Number(row.colorId),
      suffix: suffix === "" ? null : suffix,
      isDefault: row.colorId === values.defaultColorId,
      sortOrder: Number(row.sortOrder.trim()),
    });
  });
  if (Object.keys(errors).length === 0) {
    const colors = rows.map((r) => r.colorId);
    const suffixes = rows.flatMap((r) => (r.suffix === null ? [] : [r.suffix]));
    if (new Set(colors).size !== colors.length) errors.colors = DUPLICATE_COLOR;
    else if (new Set(suffixes).size !== suffixes.length)
      errors.colors = DUPLICATE_SUFFIX;
    else if (rows.length > 0 && rows.filter((r) => r.isDefault).length !== 1)
      errors.colors = NEEDS_ONE_DEFAULT;
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return { ok: true, value: { productId: Number(values.productId), rows } };
}

export function colorValuesFrom(
  productId: number,
  rows: ColorAssignment[]
): ColorValues {
  return {
    productId: String(productId),
    rows: rows.map((r) => ({
      colorId: String(r.colorId),
      suffix: r.suffix ?? "",
      sortOrder: String(r.sortOrder),
    })),
    defaultColorId: String(rows.find((r) => r.isDefault)?.colorId ?? ""),
  };
}
```

```ts
// lib/admin/colors.ts
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";
import type { ColorAssignment } from "./products";

// The function keeps the display order of the array (sort_order = position).
export async function setProductColors(
  client: AdminClient,
  productId: number,
  rows: ColorAssignment[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_colors", {
    p_product_id: productId,
    payload: rows.map((r) => ({
      color_id: r.colorId,
      suffix: r.suffix,
      is_default: r.isDefault,
    })),
  });
  if (error) return err(fromPg(error));
  return ok(null);
}
```

Action (append to `actions.ts`):

```ts
export async function saveColorsAction(
  _prev: FormState<ColorValues>,
  formData: FormData
): Promise<FormState<ColorValues>> {
  const values = readColorsForm(formData);
  const parsed = parseColors(values);
  if (!parsed.ok)
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  const { productId, rows } = parsed.value;
  const done = await runWrite(values, "[admin] save colours", (c) =>
    setProductColors(c, productId, rows)
  );
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}
```

`components/admin/color-section.tsx` (`"use client"`): props `{ action, productId, initial: ColorAssignment[], colors: EditorOptions["colors"] }`. `<section aria-labelledby="colors-heading">`, `<h2 id="colors-heading">Farben</h2>`, explanatory text "Bestellnummer = Artikelnummer + „ - “ + Suffix. Ohne Farben gilt die reine Artikelnummer.". A form with hidden `productId`; rows in `useState` (from `colorValuesFrom(productId, initial).rows`, then from `state.values` after a response). Each row (a `<fieldset>` with `<legend className="sr-only">Farbe {i + 1}</legend>`): colour swatch (`<span aria-hidden style={{ background: hex }}>`), `<select name="colorId">` (label "Farbe"), `<Input name="suffix">` (label "Suffix"), `<Input name="sortOrder" inputMode="numeric">` (label "Reihenfolge"), `<input type="radio" name="defaultColor" value={colorId}>` (label "Standard"), "Entfernen" button. Below: "Farbe hinzufügen" (adds a row with the first unused colour; disabled when all are used), set-level error `fieldErrors.colors` and `formError` with `role="alert"`, row errors under their inputs, submit "Farben speichern". On saved → `toast.success("Farben gespeichert.")`. Ids per row must be unique (`color-${i}`, `suffix-${i}`, …).

Render `<ColorSection …/>` in the product edit page below the article section.

- [ ] **Step 4: Run** `pnpm vitest run lib/admin components/admin && pnpm typecheck && pnpm lint && pnpm build` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(admin): colour assignments with suffix and default"`

---

### Task 12: End-to-end tests for the admin

Covers: SC-1, SC-2, SC-4, SC-5, SC-6, SC-9, SC-11, SC-12, SC-13 (e2e parts).

**Files:**

- Create: `e2e/admin/admin.setup.ts`, `e2e/admin/admin.teardown.ts`, `e2e/admin/support.ts`, `e2e/admin/auth.spec.ts`, `e2e/admin/products.spec.ts`, `e2e/admin/a11y.spec.ts`
- Modify: `playwright.config.ts`, `.gitignore` (`/e2e/.auth/`)

**Interfaces:**

- Consumes: `pnpm admin:create` (Task 5), all admin UI (Tasks 6–11). Labels and button names exactly as defined in Tasks 6, 9, 10, 11.
- Produces: Playwright projects `chromium` (public, unchanged tests), `admin-setup` (+ teardown `admin-teardown`), `admin` (depends on `chromium` and `admin-setup`, so admin mutations never race the public specs). Storage state `e2e/.auth/admin.json`.

- [ ] **Step 1: Playwright config**

```ts
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /admin\// },
    { name: "admin-setup", testMatch: /admin\/admin\.setup\.ts/, teardown: "admin-teardown" },
    { name: "admin-teardown", testMatch: /admin\/admin\.teardown\.ts/ },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["chromium", "admin-setup"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
```

Keep everything else. Add `/e2e/.auth/` to `.gitignore`.

- [ ] **Step 2: Support, setup and teardown**

```ts
// e2e/admin/support.ts
import { execFileSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const ADMIN_EMAIL = "e2e-admin@example.test";
export const ADMIN_PASSWORD = "e2e-admin-password-123";
export const USER_EMAIL = "e2e-user@example.test";
export const USER_PASSWORD = "e2e-user-password-123";
export const STORAGE_STATE = "e2e/.auth/admin.json";

export function localStack(): { url: string; secret: string } {
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
    !("SECRET_KEY" in status) ||
    typeof status.API_URL !== "string" ||
    typeof status.SECRET_KEY !== "string"
  )
    throw new Error("Local Supabase is not running — run `pnpm db:start`.");
  return { url: status.API_URL, secret: status.SECRET_KEY };
}

export function serviceClient() {
  const { url, secret } = localStack();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Runs the real CLI (SC-3 end to end): password via stdin, keys via env.
export function createAdmin(): void {
  const { url, secret } = localStack();
  execFileSync("pnpm", ["admin:create", "--email", ADMIN_EMAIL], {
    input: ADMIN_PASSWORD,
    env: {
      ...process.env,
      IMPORT_SUPABASE_URL: url,
      IMPORT_SUPABASE_SECRET_KEY: secret,
    },
    stdio: ["pipe", "ignore", "inherit"],
  });
}
```

```ts
// e2e/admin/admin.setup.ts
import { expect, test as setup } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createAdmin,
  serviceClient,
  STORAGE_STATE,
  USER_EMAIL,
  USER_PASSWORD,
} from "./support";

setup("create users and sign in the admin", async ({ page }) => {
  createAdmin();
  const svc = serviceClient();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  const user = data.users.find((u) => u.email === USER_EMAIL);
  if (user)
    await svc.auth.admin.updateUserById(user.id, {
      password: USER_PASSWORD,
      app_metadata: {},
    });
  else
    await svc.auth.admin.createUser({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      email_confirm: true,
    });

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(ADMIN_EMAIL);
  await page.getByLabel("Passwort").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte$/);
  await page.context().storageState({ path: STORAGE_STATE });
});
```

```ts
// e2e/admin/admin.teardown.ts
import { test as teardown } from "@playwright/test";
import { serviceClient } from "./support";

// Products created by the admin specs use the slug prefix "e2e-"; removing
// them keeps later runs and the pgTAP counts stable.
teardown("remove e2e products", async () => {
  await serviceClient().from("product").delete().like("slug", "e2e-%");
});
```

- [ ] **Step 3: Auth spec (no storage state)**

```ts
// e2e/admin/auth.spec.ts
import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
} from "./support";

test.describe("admin auth", () => {
  test("redirects to the login page with next (SC-1)", async ({ page }) => {
    await page.goto("/admin/produkte");
    await expect(page).toHaveURL("/admin/login?next=%2Fadmin%2Fprodukte");
  });

  test("wrong password shows the generic message (SC-2)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-Mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Passwort").fill("wrong-password-000");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "E-Mail oder Passwort ist falsch."
    );
  });

  test("login lands on next, logout returns to login (SC-2)", async ({
    page,
  }) => {
    await page.goto("/admin/produkte?status=draft");
    await page.getByLabel("E-Mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Passwort").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/admin/produkte?status=draft");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/produkte");
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  });

  test("a non-admin sees the 403 page (SC-1)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-Mail").fill(USER_EMAIL);
    await page.getByLabel("Passwort").fill(USER_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(
      page.getByRole("heading", { name: "Kein Zugriff" })
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("public pages set no auth cookies (SC-1)", async ({ page, context }) => {
    await page.goto("/");
    await page.goto("/produkte/moebelteile/testkeil-mit-daempfung");
    expect(
      (await context.cookies()).filter((c) => c.name.startsWith("sb-"))
    ).toEqual([]);
  });
});
```

- [ ] **Step 4: Products spec (admin storage state, serial)**

```ts
// e2e/admin/products.spec.ts
import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const NAME = `E2E Produkt ${run}`;
const SLUG = `e2e-produkt-${run}`;
const NUMBER = `E2E-${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let editUrl = "";

test("filter by article number shows its product (SC-5)", async ({ page }) => {
  await page.goto("/admin/produkte");
  await page.getByLabel("Name oder Artikelnummer").fill("99211/80");
  await page.getByRole("button", { name: "Filtern" }).click();
  await expect(
    page.getByRole("link", { name: "Testrohrschelle" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Testkeil mit Dämpfung" })
  ).toHaveCount(0);
});

test("create a draft (SC-6)", async ({ page }) => {
  await page.goto("/admin/produkte/neu");
  await page
    .getByLabel("Kategorie")
    .selectOption({ label: "Möbelteile (Beispiel)" });
  await page.getByLabel("Name").fill(NAME);
  await expect(page.getByLabel("Slug")).toHaveValue(SLUG);
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte\/\d+$/);
  editUrl = new URL(page.url()).pathname;
  const response = await page.request.get(PUBLIC_URL);
  expect(response.status()).toBe(404);
});

test("publishing without articles is refused (SC-11)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Status").selectOption("published");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "mindestens einen Artikel"
  );
});

test("add an article with attribute and pack size (SC-9)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Artikel hinzufügen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Artikelnummer").fill(NUMBER);
  await dialog.getByLabel("Höhe (mm)").fill("8,5");
  await dialog.getByLabel("Menge").first().fill("250");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  const table = page.getByRole("table", { name: "Artikel" });
  await expect(table).toContainText(NUMBER);
  await expect(table).toContainText("8,5");
  await expect(table).toContainText("250");
});

test("assign a default colour and publish (SC-10, SC-11)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Farbe hinzufügen" }).click();
  await page.getByLabel("Suffix").first().fill("1");
  await page.getByLabel("Standard").first().check();
  await page.getByRole("button", { name: "Farben speichern" }).click();
  await expect(page.getByText("Farben gespeichert.")).toBeVisible();
  await page.getByLabel("Status").selectOption("published");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await page.goto(PUBLIC_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME })
  ).toBeVisible();
  await expect(page.getByText(`${NUMBER} - 1`).first()).toBeVisible();
});

test("published products cannot be deleted, their last article neither (SC-9, SC-12)", async ({
  page,
}) => {
  await page.goto(editUrl);
  await expect(
    page.getByRole("button", { name: "Produkt löschen" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: `Artikel ${NUMBER} löschen` }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toContainText(
    "mindestens einen Artikel"
  );
});

test("renaming shows the new name on the next request (SC-13)", async ({
  page,
}) => {
  await page.goto(PUBLIC_URL); // warm the ISR cache
  await page.goto(editUrl);
  await page.getByLabel("Name").fill(`${NAME} neu`);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await page.goto(PUBLIC_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: `${NAME} neu` })
  ).toBeVisible();
  await page.goto("/produkte/moebelteile");
  await expect(page.getByText(`${NAME} neu`)).toBeVisible();
});

test("archive, then delete after confirmation (SC-12)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Status").selectOption("archived");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Produkt löschen" }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte$/);
  await expect(page.getByRole("link", { name: `${NAME} neu` })).toHaveCount(0);
});
```

Note: the slug stays `SLUG` after the rename because the slug field is no longer auto-filled on edit.

- [ ] **Step 5: Accessibility and noindex spec**

```ts
// e2e/admin/a11y.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });

async function blocking(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
    );
}

test.describe("admin login accessibility (SC-4)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("login page", async ({ page }) => {
    await page.goto("/admin/login");
    expect(await blocking(page)).toEqual([]);
  });
});

test.describe("admin accessibility and noindex (SC-4)", () => {
  test("list, edit form and open dialog", async ({ page }) => {
    await page.goto("/admin/produkte");
    expect(await blocking(page)).toEqual([]);
    await page.getByRole("link", { name: "Testkeil mit Dämpfung" }).click();
    expect(await blocking(page)).toEqual([]);
    await page.getByRole("button", { name: "Artikel hinzufügen" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await blocking(page)).toEqual([]);
  });

  test("admin pages carry noindex and the demo banner", async ({ page }) => {
    const response = await page.goto("/admin/produkte");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    );
    await expect(
      page
        .getByRole("region", { name: /Vorschau|Demo/ })
        .or(page.getByText(/Vorschau/).first())
    ).toBeVisible();
  });
});
```

For the demo-banner assertion use the same locator as `e2e/demo-banner.spec.ts` (read it and copy the locator; the `or(...)` above is only a fallback).

- [ ] **Step 6: Run the whole E2E suite against a fresh stack and a production build**

```bash
pnpm db:reset
eval "$(pnpm exec supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^PUBLISHABLE_KEY=/export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/p')"
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
pnpm build && pnpm e2e
```

Expected: all projects pass (public `chromium`, `admin-setup`, `admin`, `admin-teardown`). Then `pnpm db:test` must still pass (teardown removed the e2e products).

- [ ] **Step 7: Commit** `git commit -m "test(e2e): admin auth, product maintenance and accessibility"`

---

### Task 13: Documentation and status

Covers: FR-15/SC-15.

**Files:**

- Modify: `docs/data-model.md`, `docs/specs/2026-10-10-admin-products-design.md` (status), `docs/roadmap.md` (fixed decision row for the admin), `CLAUDE.md` (commands list only — the status line is updated after Gate 2)

- [ ] **Step 1: `docs/data-model.md`**

Under "Access rules (RLS)" add:

```markdown
- Published products cannot be deleted, not even by the admin (policy
  "admin delete" requires `status <> 'published'`); archive them instead.
- Admin writes spanning several tables use two `security invoker` functions,
  executable by `authenticated` and guarded by `private.is_admin()`:
  `admin_save_article(payload)` (article + attributes + pack sizes in one
  transaction; the article number is never updated) and
  `admin_set_product_colors(product_id, payload)` (replaces the colour set;
  no colour or suffix twice, exactly one default when colours exist).
```

- [ ] **Step 2: Spec status** — change `- **Status:** draft (2026-10-10)` to `- **Status:** implemented (2026-10-10)`; if any decision changed during implementation (e.g. native `<select>` instead of shadcn `select`), add one line per change under a new `## Deviations` section at the end.

- [ ] **Step 3: Roadmap** — add a row to "Fixed decisions": `| Admin | Supabase Auth with e-mail + password, admin = app_metadata.role; \`proxy.ts\` + \`checkAdmin()\` + RLS; shadcn/ui; \`revalidatePath('/', 'layout')\` after every write; admins via \`pnpm admin:create\` |`. Leave feature 6a status at "in progress" (set to "done" after Gate 2).

- [ ] **Step 4: `CLAUDE.md`** — in "Commands" add: `- Create or reset an admin user: \`printf '%s' "$PW" | pnpm admin:create --email <address>\` (see \`docs/deploy.md\`)`.

- [ ] **Step 5: Run** `pnpm exec prettier --check docs CLAUDE.md && pnpm lint` — Expected: exit 0.

- [ ] **Step 6: Commit** `git commit -m "docs: admin functions, delete rule and admin provisioning"`

---

## Final verification (before Gate 2)

```bash
pnpm db:reset
pnpm typecheck; echo "typecheck=$?"
pnpm lint; echo "lint=$?"
pnpm test; echo "test=$?"
pnpm db:test; echo "db:test=$?"
# build with local stack env (Task 12 Step 6), then:
pnpm build; echo "build=$?"
pnpm e2e; echo "e2e=$?"
pnpm db:types && git diff --exit-code -- lib/supabase/database.types.ts; echo "types=$?"
```

All must print `=0`. Then: code-reviewer agent over `git diff main...HEAD`, `security-review` (auth, sessions, Server Actions, SQL functions are security-relevant), fix blockers, Gate 2 report with commands and exit codes, the before/after screenshot result (Task 1) and SC-16 as deferred unless the developer runs `pnpm admin:create` against production.

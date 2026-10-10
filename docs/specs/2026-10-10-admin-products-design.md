# Feature 6a — Admin: auth & product maintenance

- **Status:** implemented (2026-10-10)
- **Roadmap:** feature 6a ([roadmap](../roadmap.md)); feature 6 is split into 6a
  and 6b (D1)
- **Estimate:** 12 h (feature 6 total: 22 h → 6a 12 h, 6b 10 h)
- **Builds on:** feature 2 (RLS with `private.is_admin()`, grants, `variant`
  view), feature 3 (`slugify`, `remove_catalog()`), feature 4 (catalog pages
  with ISR, E2E stack), feature 5 (Server Action + shared Zod schema pattern)

## Goal

An admin signs in with e-mail and password and maintains products end to end:
product data, articles with typed attributes and pack sizes, colour
assignments with suffix and default, status and deletion. Every change is
visible on the public site on the next request, without a redeploy. The admin
is not publicly accessible; it is shown via screenshots and video (feature 8).

## Scope

In scope:

- Supabase Auth sessions via `@supabase/ssr` (cookies), `proxy.ts` for
  session refresh and the optimistic redirect, `requireAdmin()` on every admin
  page and action
- Login and logout; admin provisioning via `pnpm admin:create`
- Admin shell with shadcn/ui components
- Product list with filters; create, edit, status change, delete
- Articles of a product: create, edit, delete; attributes per category;
  pack sizes
- Colour assignments of a product: colour, suffix, default, order
- On-demand revalidation of the public pages after every write
- Docs: `docs/deploy.md` (admin provisioning), `docs/data-model.md` (admin
  functions, delete rule), roadmap

Out of scope (6b or later):

- Images: upload, alt text, order, orphan cleanup (6b)
- Categories, colours, materials, accessories as master data (6b);
  6a only selects existing categories, colours and materials
- Attribute definitions and `category_attribute` (stay import-managed)
- AI suggestions (feature 7); 6a only maintains the origin fields (D7)
- MFA, password reset by e-mail, several roles, audit log, optimistic
  locking, drag-and-drop sorting, Markdown preview, bulk edits
- Redirects after slug changes (preview, `noindex`; see roadmap "Later")

## Decisions

### D1 — Feature 6 is split into 6a and 6b

6a (this spec) covers auth, the admin shell and everything that belongs to a
product. 6b covers images and the master data (categories, colours,
materials, accessories). Each part gets its own spec, plan, PR and session.
The admin nav in 6a has one entry ("Produkte"); 6b adds the rest.

### D2 — Sessions with `@supabase/ssr`, three layers of checks

`lib/supabase/session.ts` (`server-only`) creates a server client with the
publishable key and the request cookies (`getAll`/`setAll` via
`next/headers`). The existing `createServerSupabase()` stays unchanged for
the public pages, which remain cookie-free and cacheable.

1. **`proxy.ts`** (matcher `/admin/:path*`) refreshes the session
   (`auth.getClaims()`) and writes refreshed cookies. Without claims it
   redirects every admin path except `/admin/login` to
   `/admin/login?next=<path>`. This is an optimistic check only.
2. **`requireAdmin()`** (`lib/admin/auth.ts`) runs in the protected admin
   layout and at the start of every admin Server Action. No claims →
   redirect to the login page; claims without `app_metadata.role = 'admin'`
   → a 403 page with a logout button (layout) or a `forbidden` error
   (action).
3. **RLS** stays the security boundary: every write runs with the session
   client as `authenticated`, so `private.is_admin()` decides.

Routes: `app/admin/login/page.tsx` (public) and `app/admin/(protected)/…`
with the layout that calls `requireAdmin()`. `/admin` redirects to
`/admin/produkte`. All admin pages render per request.

### D3 — Login with e-mail and password

The login form posts to a Server Action that validates with Zod and calls
`signInWithPassword`. Any failure shows one generic message ("E-Mail oder
Passwort ist falsch."); brute force is limited by GoTrue's rate limits
(`[auth.rate_limit]`). After login the action redirects to `next` if it is a
path under `/admin/` (no `//`, no scheme), otherwise to `/admin/produkte`.
Logout is a Server Action calling `signOut` and redirecting to the login
page. Signup stays disabled; there is no password reset (an admin resets via
`pnpm admin:create`).

### D4 — Admin provisioning via `pnpm admin:create`

`scripts/admin/create.mts` reads `SUPABASE_URL` and the service-role key
like the importer (`.env.import`), takes `--email <address>` and reads the
password from stdin (never from argv or env, never logged, at least 12
characters). It creates the user with `email_confirm: true` and
`app_metadata.role = 'admin'`, or updates password and role if the e-mail
exists. Exit ≠ 0 on any error. Used for local development, the E2E global
setup and production; `docs/deploy.md` replaces "admin users are created
manually" with this command.

### D5 — Admin shell with shadcn/ui

shadcn/ui components are generated into `components/ui/` with the shadcn CLI
(`pnpm dlx shadcn@latest`, not a dependency): button, input, textarea,
label, select, table, dialog, alert-dialog, badge, sonner. The CLI's
`globals.css` changes are reviewed by hand: theme variables are added, but
base-layer rules must not change the public pages' look. The demo banner
and `noindex` apply to the admin like to every page. The header shows
"Admin", the user's e-mail, the nav and a logout button.

### D6 — Product list and product form

`/admin/produkte` lists all products (≈ 130, no pagination) in a table:
name, category, status badge, article count, last change. Filters via search
params: category, status, text (`ilike` on product name and article
number). Sorted by category order, then product order.

`/admin/produkte/neu` and `/admin/produkte/[id]` share one form: category,
name, slug, subtitle, description (Markdown textarea), material and material
note, status, sort order, SEO title and description. On create, the slug is
filled from the name with the existing `slugify` (moved to
`lib/catalog/slug.ts` and re-exported for the importer); it stays editable.
On edit, a hint says that a slug or category change changes the public URL.
A taken slug (`23505` on `(category_id, slug)`) is a field error.

### D7 — Origin fields

`lib/admin/origin.ts` derives the new origin per field group
(`description` → `description_origin`; `seo_title` + `seo_description` →
`seo_origin`): unchanged → previous origin; changed and previous `human` →
`human`; changed and previous `ai` or `ai_edited` → `ai_edited`. New products
start with `human`. The public AI label (feature 4) therefore stays correct
when an admin edits AI text.

### D8 — Articles in a dialog, saved atomically

The product edit page lists the product's articles (number, name,
attributes, pack sizes). "Artikel hinzufügen" and "Bearbeiten" open a
dialog with: article number, name, description, note, material override and
note, sort order, one input per attribute, pack sizes (rows of quantity and
optional label).

- **Article number:** required on create, trimmed, otherwise taken as typed
  (the numbering system is non-negotiable). Read-only after creation; a
  wrong number is fixed by deleting and re-creating the article. A taken
  number is a field error.
- **Attributes:** the inputs are the attributes of the product's category
  (`category_attribute`) plus every attribute the article already has a
  value for. Decimal inputs accept a comma or a dot; an empty input means no
  value.
- **Saving:** `public.admin_save_article(payload jsonb)` (`security
invoker`, so RLS applies; execute for `authenticated` only) inserts or
  updates the article and replaces its attributes and pack sizes in one
  transaction. A type mismatch raised by the existing trigger rolls back
  everything.
- **Deleting:** confirmation dialog; refused while the product is published
  and this is its last article.

### D9 — Colour assignments as one set

The product edit page has a colour section: rows of colour (select from
`color`), suffix (optional), default (radio), sort order. Saving sends the
whole set to `public.admin_set_product_colors(p_product_id bigint, payload
jsonb)` (`security invoker`), which replaces all rows in one transaction.
Validation (Zod and the function): no colour twice, no non-empty suffix
twice within the product (keeps order numbers unique), exactly one default
when there is at least one colour. Colour master data is maintained in 6b.

### D10 — Status rules and deletion

- **Publish** (`status = 'published'`) requires at least one article and,
  if the product has colours, exactly one default colour. The product action
  checks this before the update and returns a form error otherwise.
- **Archive / back to draft** is always allowed.
- **Delete** is offered for `draft` and `archived` products only, behind a
  confirmation dialog naming the product. The cascade removes articles,
  attributes, pack sizes, colour assignments, accessory links and
  `product_media` rows; `media` rows and files stay (cleanup in 6b).
- Defence in depth: a migration replaces the product policy "admin delete"
  with one that also requires `status <> 'published'`.

### D11 — Revalidation of the whole site after every write

After every successful write (product, article, colours, status, delete) the
action calls `revalidatePath('/', 'layout')`. Every cached page is
re-rendered on its next request. The catalog is small (≈ 140 pages, low
traffic), so this is cheaper than tracking which category, related-product
and search pages a change touches — and it cannot miss one. Failed writes do
not revalidate. The implementation checks the semantics against the bundled
Next.js 16 docs.

### D12 — Data access, validation, errors

- Shared Zod schemas in `lib/admin/schemas.ts` (form and action use the
  same schema, German messages, like feature 5).
- Admin data access in `lib/admin/*.ts`, returning `Result` (`lib/result.ts`)
  with error kinds `forbidden`, `not_found`, `conflict` (field), `invalid`
  (precondition, D10), `db_error`.
- Server Actions in `app/admin/(protected)/…/actions.ts` return
  `{ status, fieldErrors, formError, values }` for `useActionState`; forms
  work without JavaScript except the dialogs (the admin requires
  JavaScript; acceptable, it is not public).
- `db_error`: generic form error "Speichern fehlgeschlagen.", log with
  context and PG code only — no field values, no e-mail addresses.
- Success: toast (sonner) and, for create, a redirect to the edit page.

## Requirements and success criteria

| ID    | Requirement                                        | Success criterion                                                                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Session client, proxy and `requireAdmin()` per D2. | **SC-1** (unit): `requireAdmin` returns the user for admin claims, redirects without claims, returns `forbidden` for non-admin claims; (e2e): `/admin/produkte` without session redirects to `/admin/login?next=%2Fadmin%2Fprodukte`; a non-admin user sees the 403 page; public pages set no auth cookies.                |
| FR-2  | Login and logout per D3.                           | **SC-2** (unit): the `next` check accepts `/admin/produkte/3` and rejects `//evil.example`, `https://…`, `/produkte`; (e2e): a wrong password shows the generic message; a correct login lands on `next`; logout returns to the login page and `/admin/produkte` redirects again.                                          |
| FR-3  | `pnpm admin:create` per D4.                        | **SC-3** (unit): missing `--email`, missing or short password fail with exit ≠ 0 and no secret in the output; (int): against the local stack the first run creates an admin whose JWT passes `private.is_admin()`, the second run updates the password without creating a second user.                                     |
| FR-4  | Admin shell with shadcn/ui per D5.                 | **SC-4** (unit): the header renders nav, e-mail and logout; (e2e): admin pages show the demo banner and carry the robots meta tag and `X-Robots-Tag`; axe reports no serious or critical violations on list, form and an open dialog; (review): before/after screenshots of home and a product page show no visual change. |
| FR-5  | Product list with filters per D6.                  | **SC-5** (int): the list query filters by category, status and text (product name and article number) and includes drafts; (e2e): filtering by an article number shows its product.                                                                                                                                        |
| FR-6  | Create and edit products per D6.                   | **SC-6** (unit): schema accepts valid input and rejects empty name, invalid slug, over-long SEO fields with German messages; a taken slug maps to a slug field error; (e2e): creating a draft redirects to its edit page; the draft is not public.                                                                         |
| FR-7  | Origin rule per D7.                                | **SC-7** (unit): all four transitions of the rule for both field groups; new products get `human`.                                                                                                                                                                                                                         |
| FR-8  | `admin_save_article` per D8.                       | **SC-8** (pgTAP): insert and update replace attributes and pack sizes; a wrong attribute type rolls back the whole call; `anon` cannot execute it; a non-admin `authenticated` call changes nothing (RLS).                                                                                                                 |
| FR-9  | Article dialog per D8.                             | **SC-9** (unit): schema parses `8,5` and `8.5`, rejects a non-positive pack size and an empty article number; the number input is read-only in edit mode; (e2e): adding an article with an attribute and a pack size shows it in the product's article list; deleting the last article of a published product is refused.  |
| FR-10 | `admin_set_product_colors` per D9.                 | **SC-10** (pgTAP): the set replaces all rows; duplicate colour, duplicate suffix or a default count other than one (with colours) raises and keeps the old rows; (unit): the schema reports the same three errors as field errors.                                                                                         |
| FR-11 | Status rules per D10.                              | **SC-11** (unit, fake data access): publishing without articles or without a default colour returns a form error and does not update; (e2e): publishing a complete draft makes it visible on its public URL.                                                                                                               |
| FR-12 | Delete rules per D10.                              | **SC-12** (pgTAP): an admin cannot delete a published product, can delete a draft, and the cascade leaves no articles or colour rows; (e2e): the delete button is absent for published products; deleting a draft after confirmation removes it from the list.                                                             |
| FR-13 | Revalidation per D11.                              | **SC-13** (unit): every action calls the revalidation helper after a successful write and never after a failed one; (e2e, production build): renaming a published product shows the new name on its public page and its category page on the next request.                                                                 |
| FR-14 | Errors and logging per D12.                        | **SC-14** (unit): a `db_error` returns the generic form error; the logger receives context and PG code but no submitted value and no e-mail address.                                                                                                                                                                       |
| FR-15 | Docs updated.                                      | **SC-15** (review): `docs/deploy.md` documents `pnpm admin:create`; `docs/data-model.md` lists both admin functions and the delete rule; roadmap shows 6a/6b.                                                                                                                                                              |
| FR-16 | Production admin exists (needs the developer).     | **SC-16** (ops): after deploy `pnpm admin:create` runs against production and the login works on the preview domain; evidence in the Gate 2 report or deferred.                                                                                                                                                            |

## Structure

```
proxy.ts                                  session refresh, optimistic redirect (D2)
app/admin/page.tsx                        redirect → /admin/produkte
app/admin/login/{page.tsx,actions.ts}     login (D3)
app/admin/(protected)/layout.tsx          requireAdmin, shell (D2, D5)
app/admin/(protected)/produkte/…          list, neu, [id], actions.ts
components/ui/…                           shadcn/ui (generated)
components/admin/…                        shell, product form, article dialog, colour section
lib/supabase/session.ts                   cookie-based server client
lib/admin/{auth,schemas,origin,products,articles,colors,revalidate}.ts
lib/catalog/slug.ts                       slugify (moved from the importer)
scripts/admin/create.mts                  admin:create (D4)
supabase/migrations/…_admin_functions.sql admin_save_article, admin_set_product_colors, delete policy
supabase/tests/11_admin.test.sql          SC-8, SC-10, SC-12
e2e/admin*.spec.ts                        global setup creates the admin via admin:create
```

## Data flow

Form → Server Action → `requireAdmin()` → Zod → `lib/admin/*` with the
session client → Postgres (RLS, functions) → on success
`revalidatePath('/', 'layout')` → result to `useActionState` → toast.

## New dependencies

- `@supabase/ssr` — cookie-based sessions for the App Router (D2)
- shadcn/ui runtime dependencies as installed by the CLI: `radix-ui`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `sonner`; dev: `tw-animate-css`

## Error handling

| Case                                 | Behaviour                                            |
| ------------------------------------ | ---------------------------------------------------- |
| No session                           | Redirect to `/admin/login?next=…` (proxy and layout) |
| Session without admin role           | 403 page with logout; actions return `forbidden`     |
| Invalid input                        | Field errors, submitted values kept                  |
| Unique violation (slug, number)      | Field error on the affected field                    |
| Precondition (publish, last article) | Form error, nothing written                          |
| Function raises (colours, attribute) | Form error with the reason, nothing written          |
| Other DB error                       | Generic form error, log with context and PG code     |

## Prerequisites from the developer

- Production run of `pnpm admin:create` for SC-16 (can be deferred)

## Risks

- **Self-hosted legacy JWT (HS256):** `getClaims()` cannot verify locally
  and falls back to a request to GoTrue — one round trip per admin request,
  acceptable for a single admin. Public pages are not affected.
- **shadcn base styles** could change the public pages; mitigated by the
  hand review of `globals.css` and the screenshot check in SC-4.
- **Next.js 16 conventions** (`proxy.ts`, `revalidatePath`, `forbidden`):
  the implementation reads the bundled docs in `node_modules/next/dist/docs/`
  first.
- **Cookies on public pages** would make them dynamic; the proxy matcher is
  limited to `/admin/:path*` and SC-1 checks that public pages set no auth
  cookies.

## Deviations

- Admin forms use native `<select>` elements instead of the shadcn `select` component (they submit with FormData and work without client state).
- `requireAdmin()` (D2) is implemented as `checkAdmin()` returning `admin | forbidden | anonymous`; the protected layout and every action redirect or refuse based on it.
- Logout ends the admin's sessions on all devices (supabase-js default `global` scope).
- Duplicate pack quantities per article are rejected in the form ("Diese Menge ist schon erfasst."), matching the primary key of `article_packaging`.
- Playwright honours `E2E_PORT` (default 3000) and targets `127.0.0.1`.

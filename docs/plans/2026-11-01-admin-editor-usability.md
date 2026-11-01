# Feature 6c — Admin: editor usability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product and category editor for non-technical editors: slugs made on the server, an optional SEO section with the automatic text as preview, colours and images ordered by drag and drop or ↑/↓, touch-friendly explanations, and no horizontal scrolling on phones.

**Architecture:** Slug creation moves into pure helpers (`lib/catalog/slug.ts`) plus small DB helpers (`lib/admin/slugs.ts`) that `saveProduct`/`saveCategory` call; the slug leaves the form schemas. The public metadata builder is split into pure "automatic value" functions that the admin forms reuse for placeholders. One generic client `SortableList` (dnd-kit) renders the colour and image rows.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Tailwind 4, shadcn/ui (`radix-ui`), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, Supabase (local stack for tests), Vitest + Testing Library, Playwright, pnpm 10.

**Spec:** `docs/specs/2026-11-01-admin-editor-usability-design.md` (absolute: `/Users/eugen/Projects/baumann-demo/.claude/worktrees/feat+admin-editor-usability/docs/specs/2026-11-01-admin-editor-usability-design.md`). Read D1–D8 before your task.

## Global Constraints

- Work only in the worktree `/Users/eugen/Projects/baumann-demo/.claude/worktrees/feat+admin-editor-usability` on branch `feat/admin-editor-usability`. pnpm only, never npm.
- New dependencies, exact versions only: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` (Task 4); `components/ui/popover.tsx` from shadcn (Task 5). Nothing else.
- Read the relevant guide in `node_modules/next/dist/docs/` before touching forms, Server Actions or client components (Next.js 16 differs from older versions).
- Tests carry the spec IDs as `(6c SC-n)` in the `describe`/`test` title.
- UI copy (German, exact): "Der Name braucht mindestens einen Buchstaben oder eine Ziffer.", "Adresse: {path}", "Eine Änderung der Kategorie ändert die Adresse.", "Die Adresse entsteht beim Anlegen aus dem Namen.", "Suchmaschinen (optional)", "Leer lassen, dann erzeugt die Seite Titel und Beschreibung automatisch. Die Felder zeigen diesen Text als Vorschau.", "Titel für Suchmaschinen", "Höchstens 70 Zeichen.", "Beschreibung für Suchmaschinen", "Höchstens 160 Zeichen.", "{Farbe|Bild} {n} nach oben", "{Farbe|Bild} {n} nach unten", "{label} steht jetzt auf Position {n} von {m}.", "Position 1 ist die erste Farbe auf der Produktseite.", "Was bedeutet Standard?", "Die Standardfarbe ist auf der Produktseite vorausgewählt. Ihre Bestellnummer steht im Auswahlblock, bis jemand eine andere Farbe wählt."
- The server never reads a slug from form data. Existing slugs are never rewritten.
- No migration, no change to RLS, public pages or the importer. Public metadata output stays identical for products with articles.
- Never remove the demo notice or `noindex`. Never commit images or Storage files.
- Tests, `db:test` and e2e run only against the local Supabase stack, never the preview database. The worktree has an ignored `.env.local` that points at the local stack (API URL, its `ANON_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`), so `pnpm build`, `pnpm dev` and `next typegen` use the local stack. Never read, print or edit any `.env*` file. E2E: `pnpm db:reset`, `pnpm build`, `pnpm e2e` (with `E2E_PORT=3100` if port 3000 is taken; never with `pnpm dev` of the main checkout running on the e2e port).
- Run `pnpm exec next typegen` once before the first `pnpm typecheck` in the fresh worktree.
- Commit after each task with a Conventional Commit message; Husky runs gitleaks, lint-staged, typecheck and tests.

## Review Focus

1. Names with umlauts, ß, symbols and slashes ("Stütze Ø 20 mm / lang") → slug `stuetze-20-mm-lang` → Task 2 unit test.
2. A product "Rohr 2" already owns `rohr-2`; a new "Rohr" in the same category where `rohr` is taken gets `rohr-3`, not a clash → Task 2 unit test.
3. Rename and category change in the same save: the slug stays the old one if it is free in the new category (never re-derived from the new name) → Task 2 integration test.
4. Changing a colour row's colour after reordering keeps its position and keeps "Standard" on that row; removing a row renumbers positions and button labels → Task 4 test.
5. Only the SEO description has a saved value: the section opens and the empty title still shows the automatic placeholder → Task 3 test.

---

### Task 1: Docs bootstrap (model: Haiku, effort: low)

**Files:**

- Add: `docs/specs/2026-11-01-admin-editor-usability-design.md`, `docs/plans/2026-11-01-admin-editor-usability.md` (both already in the worktree, untracked)
- Modify: `docs/roadmap.md` row 6c: status `open` → `in progress`; replace the sentence starting "Open for the spec:" with "— [spec](specs/2026-11-01-admin-editor-usability-design.md)"; estimate `5 h` → `7 h`
- Modify: `docs/specs/2026-10-10-admin-products-design.md` D6 (the paragraph "On create, the slug is filled …"): append "Corrected by [feature 6c](2026-11-01-admin-editor-usability-design.md) (D1, D2): no slug field; slugs are made on the server."
- Modify: `docs/specs/2026-10-10-admin-media-master-data-design.md` D7 (category form with editable slug): append the same sentence

- [ ] **Step 1:** Make the edits; run `pnpm exec prettier --write docs/roadmap.md docs/specs/2026-10-10-admin-products-design.md docs/specs/2026-10-10-admin-media-master-data-design.md docs/specs/2026-11-01-admin-editor-usability-design.md docs/plans/2026-11-01-admin-editor-usability.md`.
- [ ] **Step 2:** `git add docs/ && git commit -m "docs: add spec and plan for feature 6c"`

---

### Task 2: Slugs on the server, address line (model: Sonnet, effort: high)

**Files:**

- Modify: `lib/catalog/slug.ts`, `lib/catalog/anchors.ts`
- Create: `lib/admin/slugs.ts`
- Modify: `lib/admin/schemas.ts`, `lib/admin/category-schema.ts`, `lib/admin/errors.ts`, `lib/admin/products.ts`, `lib/admin/categories.ts`
- Modify: `app/admin/(protected)/produkte/actions.ts`, `app/admin/(protected)/kategorien/actions.ts`, `app/admin/(protected)/produkte/[id]/page.tsx`, `app/admin/(protected)/produkte/neu/page.tsx`, `app/admin/(protected)/kategorien/[id]/page.tsx`, `app/admin/(protected)/kategorien/neu/page.tsx`
- Modify: `components/admin/product-form.tsx`, `components/admin/category-form.tsx`
- Test: `lib/catalog/slug.test.ts` (create if missing), `lib/admin/slugs.test.ts`, `lib/admin/schemas.test.ts`, `lib/admin/category-schema.test.ts`, `components/admin/product-form.test.tsx`, `components/admin/category-form.test.tsx`, `tests/integration/admin-products.test.ts`, `tests/integration/admin-categories.test.ts`

**Interfaces:**

- Produces (`lib/catalog/slug.ts`): `slugBase(name: string): string` — `slugify(name)`, cut to ≤ 120 characters at the last hyphen inside the first 120 (hard cut if there is none), no trailing hyphen. `firstFreeSlug(base: string, taken: readonly string[]): string` — `base` if not in `taken`, else `base-n` for the smallest n ≥ 2 not in `taken`.
- Produces (`lib/catalog/anchors.ts`): `categoryPath(categorySlug: string): string` → `/produkte/{encoded slug}`.
- Produces (`lib/admin/slugs.ts`): `takenProductSlugs(client: AdminClient, categoryId: number, base: string, excludeId: number | null): Promise<Result<string[], AdminError>>` and `takenCategorySlugs(client: AdminClient, base: string): Promise<Result<string[], AdminError>>` — one query each for `slug = base` or `slug like 'base-%'` (base contains only `[a-z0-9-]`); `withSlugRetry<T>(attempt: () => Promise<Result<T, AdminError>>, tries = 3): Promise<Result<T, AdminError>>` — re-runs `attempt` while it returns `{ kind: "conflict", field: "slug" }`, then returns `{ kind: "db_error", code: "23505" }` (shown as the generic form error).
- `PRODUCT_FIELDS`, `ProductValues`, `productSchema`, `CATEGORY_FIELDS`, `CategoryValues`, `categorySchema` lose `slug`; `withDefaultSlug`, `withDefaultCategorySlug`, `CATEGORY_CONFLICTS` and the `slug` entry of `CONFLICT_MESSAGES` are deleted. Both schemas reject a name whose `slugBase` is empty with the D1 copy (also on edit; one rule is simpler and a name without letters or digits is never wanted).
- `saveProduct(client, id, input)` and `saveCategory(client, id, input)` keep their signatures. Create: slug = `firstFreeSlug(slugBase(name), taken)` inside `withSlugRetry`. Product update: read `category_id, slug` with the existing `prev` query; same category → `slug` is not written; other category → keep `prev.slug` if free there (`takenProductSlugs(…, excludeId: id)`), else `firstFreeSlug(prev.slug, taken)`, inside `withSlugRetry`. Category update: read the stored slug and pass it to `admin_save_category`.
- `getCategory` returns `{ id, productCount, slug: string, values: CategoryValues }`.
- `ProductForm` gains prop `address: string | null` (`productPath(categorySlug, slug)` on edit, `null` on create); `CategoryForm` gains `address: string | null` (`categoryPath(slug)` / `null`). Edit shows "Adresse: {address}" (product additionally the category hint) where the slug field was; create shows the create hint.

- [ ] **Step 1: Write failing tests** `(6c SC-1)`/`(6c SC-2)`:
  - `slug.test.ts`: `slugBase("Testkeil mit Dämpfung")` = `"testkeil-mit-daempfung"`; `slugBase("Stütze Ø 20 mm / lang")` = `"stuetze-20-mm-lang"`; `slugBase("!!!")` = `""`; a name of 30 words "abcdef" joined by spaces → length ≤ 120, ends with `"abcdef"`; one 130-letter word → length 120. `firstFreeSlug("rohr", [])` = `"rohr"`; `(…, ["rohr"])` = `"rohr-2"`; `(…, ["rohr", "rohr-2"])` = `"rohr-3"`; `(…, ["rohr", "rohr-2", "rohr-4"])` = `"rohr-3"`; `(…, ["rohrschelle", "rohr-2a"])` = `"rohr"`; `firstFreeSlug("rohr-2", ["rohr-2"])` = `"rohr-2-2"`.
  - `slugs.test.ts`: `withSlugRetry` returns the first ok; retries a slug conflict and succeeds on try 2; after 3 slug conflicts returns `{ kind: "db_error", code: "23505" }` with `attempt` called 3 times; passes other errors through after 1 call.
  - `schemas.test.ts` / `category-schema.test.ts`: `readFields`/`readCategoryForm` with a `slug` entry produce values without `slug`; name `"!!!"` → field error with the D1 copy.
  - `product-form.test.tsx` / `category-form.test.tsx`: no `input[name="slug"]`; edit shows "Adresse: /produkte/moebelteile/testkeil-mit-daempfung" and "Eine Änderung der Kategorie ändert die Adresse." (category: "Adresse: /produkte/moebelteile"); create shows "Die Adresse entsteht beim Anlegen aus dem Namen.".
  - Integration (names start with "Int " so cleanup by `int-` works): two creates "Int Doppelt" in category 1 → slugs `int-doppelt`, `int-doppelt-2`; rename keeps the slug; rename to "Int Neu" plus move to category 2 where `int-doppelt` is free → slug stays `int-doppelt`; move into a category that already has the slug → `…-2`; categories "Int Kategorie" twice → `int-kategorie`, `int-kategorie-2`; category rename keeps the slug. Replace the old "maps a taken slug to a conflict" cases.
- [ ] **Step 2:** `pnpm test` → the new unit tests FAIL; `pnpm db:test` → the new integration tests FAIL.
- [ ] **Step 3:** Implement per Interfaces; update the two actions and four pages.
- [ ] **Step 4:** `pnpm test && pnpm db:test && pnpm typecheck && pnpm lint` → all exit 0.
- [ ] **Step 5:** Commit `feat: make product and category slugs on the server`.

---

### Task 3: Optional SEO section (model: Sonnet, effort: medium)

**Files:**

- Modify: `lib/catalog/metadata.ts`
- Create: `components/admin/seo-section.tsx`
- Modify: `components/admin/product-form.tsx`, `components/admin/category-form.tsx`, `app/admin/(protected)/produkte/[id]/page.tsx`
- Test: `lib/catalog/metadata.test.ts`, `components/admin/seo-section.test.tsx`, `components/admin/product-form.test.tsx`, `components/admin/category-form.test.tsx`

**Interfaces:**

- Consumes: Task 2 forms (`address` prop, no slug).
- Produces (`lib/catalog/metadata.ts`): `export type PageMeta`; `autoProductMeta(input: { name: string; subtitle: string | null; articleNumbers: readonly string[]; colorCount: number }): PageMeta` and `autoCategoryMeta(input: { name: string; introText: string }): PageMeta`. `productMetadata`/`categoryMetadata` delegate to them. Without article numbers the sentence is just `"{lead}."` (no "Artikel", no colours).
- Produces: `SeoSection(props: { values: { seoTitle: string; seoDescription: string }; errors: { seoTitle?: string; seoDescription?: string }; auto: PageMeta })` — native `<details>` (`open` when a value or an error exists), summary, intro, two fields with ids/names `seoTitle` and `seoDescription`, D3 labels and hints, placeholders `auto.title` / `auto.description`.
- `ProductForm` gains prop `seoContext: { articleNumbers: string[]; colorCount: number }` (edit page: `editor.articles` numbers in their order and `editor.colors.length`; create page: `[]`, `0`). Subtitle becomes controlled like name; the category form's name and intro text become controlled. Placeholders follow the typed values.

- [ ] **Step 1: Write failing tests** `(6c SC-3)`: existing `metadata.test.ts` cases unchanged; new: `autoProductMeta({ name: "Testteil", subtitle: "Klein", articleNumbers: [], colorCount: 2 }).description` = `"Testteil – Klein."`; with articles it equals `productMetadata(fixture).description` for a fixture without SEO values. `seo-section.test.tsx`: closed with empty values; open with only `seoDescription` set and the title placeholder = `auto.title`; open with an error on `seoTitle`; placeholders equal `auto`. Product form: typing "Neuer Name" into "Name" sets the title placeholder to "Neuer Name"; typing a subtitle changes the description placeholder. Category form: typing an intro text changes the description placeholder.
- [ ] **Step 2:** `pnpm test` → FAIL. **Step 3:** implement. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit `feat: move SEO fields into an optional section with automatic preview`.

---

### Task 4: Sortable list for colours and images (model: Sonnet, effort: high)

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`)
- Create: `lib/admin/sortable.ts`, `components/admin/sortable-list.tsx`
- Modify: `components/admin/color-section.tsx`, `lib/admin/color-schema.ts`, `components/admin/image-section.tsx`
- Test: `lib/admin/sortable.test.ts`, `components/admin/sortable-list.test.tsx`, `lib/admin/color-schema.test.ts`, `components/admin/color-section.test.tsx`, `components/admin/image-section.test.tsx`

**Interfaces:**

- Produces (`lib/admin/sortable.ts`): `moveItem<T>(items: readonly T[], from: number, to: number): T[]`; `moveAnnouncement(label: string, position: number, total: number): string` → `"{label} steht jetzt auf Position {position} von {total}."`.
- Produces (`components/admin/sortable-list.tsx`, client): `SortableList<T>(props: { items: readonly T[]; getKey: (item: T) => string; getLabel: (item: T) => string; noun: string; onReorder: (next: T[]) => void; renderItem: (item: T, index: number) => ReactNode })`. Renders an `<ol>`; each `<li>` holds the visible position number (`aria-hidden`, the row's legend already names it), the drag handle (`data-testid="drag-handle"`, `aria-hidden="true"`, not focusable, `touch-action: none`, lucide `GripVertical`), `renderItem(…)`, and the buttons "{noun} {n} nach oben" / "{noun} {n} nach unten" (text ↑/↓, first ↑ and last ↓ disabled). Handle and buttons are at least 24 × 24 px. One visually hidden `aria-live="polite"` element per list receives `moveAnnouncement` after every button move and every drop.
- dnd-kit setup: `DndContext` with `id` from `useId()` (stable SSR ids), sensors `MouseSensor` (`activationConstraint: { distance: 5 }`) and `TouchSensor` (`{ delay: 200, tolerance: 5 }`), no `KeyboardSensor`; `accessibility` with empty `screenReaderInstructions.draggable` and announcements that return `undefined`, so no English text is rendered; `SortableContext` with `verticalListSortingStrategy`; `useSortable` with `setActivatorNodeRef` + `listeners` on the handle only (do not spread `attributes`). No transition when `prefers-reduced-motion: reduce`.
- Focus rule (D4): after a button move, focus the same-direction button of the moved row; if that one is disabled, focus the row's other button.
- `ColorValues["rows"][number]` becomes `{ colorId: string; suffix: string }`; `readColorsForm` no longer reads `sortOrder`; `parseColors` sets `sortOrder` to the row index. `ColorSection` keeps rows with a client-only stable key, drops the "Reihenfolge" field, adds the D5 position sentence to the intro, uses `SortableList` with `noun: "Farbe"` and the colour name as label. Rows stack below `sm`.
- `ImageSection` uses `SortableList` with `noun: "Bild"` and label = alt text or "Bild"; its own ↑/↓ buttons go; placement notes stay.

- [ ] **Step 1: Write failing tests** `(6c SC-4)`: `moveItem` up/down/same index; `moveAnnouncement("weiß", 1, 3)` = `"weiß steht jetzt auf Position 1 von 3."`. `sortable-list.test.tsx` (stateful wrapper, 3 items): positions "1", "2", "3" visible; "Farbe 1 nach oben" and "Farbe 3 nach unten" disabled; click "Farbe 2 nach oben" → order swapped, live region text matches, focus on "Farbe 1 nach unten"; click "Farbe 1 nach unten" (fresh list) → focus on "Farbe 2 nach unten"; each handle has `aria-hidden="true"` and no `tabindex`; `screen.queryByText(/pick up/i)` is null. `color-schema.test.ts`: form data with stray `sortOrder` entries is ignored; parsed `sortOrder`s are `0, 1, 2`. `color-section.test.tsx`: no field "Reihenfolge"; intro contains the D5 sentence; after "Farbe 2 nach oben" the submitted `colorId` order is swapped; changing the colour of the moved row keeps its position and its "Standard" radio checked; removing a row renumbers to "Farbe 1 … Farbe n". `image-section.test.tsx`: existing tests pass; positions visible; placement notes follow a move.
- [ ] **Step 2:** `pnpm test` → FAIL. **Step 3:** implement. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit `feat: order colours and images by drag and drop or buttons`.

---

### Task 5: Help popover for "Standard" (model: Sonnet, effort: medium)

**Files:**

- Create: `components/ui/popover.tsx` (`pnpm dlx shadcn@latest add popover`; if the CLI fails, write the standard shadcn Popover on `import { Popover as PopoverPrimitive } from "radix-ui"` by hand), `components/admin/help-popover.tsx`
- Modify: `components/admin/color-section.tsx`
- Test: `components/admin/help-popover.test.tsx`, `components/admin/color-section.test.tsx`

**Interfaces:**

- Produces: `HelpPopover(props: { label: string; children: ReactNode })` — icon button (lucide `CircleHelp`, at least 24 × 24 px, accessible name = `label`) that opens the popover content on click, tap, Enter and Space, closes on Escape and outside click, and returns focus to the button.
- Each colour row's "Standard" radio gets `<HelpPopover label="Was bedeutet Standard?">` with the D5 text. If one help button per row is too noisy at 390 px, one button next to the first row's radio is enough; it must stay reachable on every list length ≥ 1.

- [ ] **Step 1: Write failing tests** `(6c SC-5)`: button "Was bedeutet Standard?" exists in the colour section; click shows the D5 text; Escape hides it and `document.activeElement` is the button; focus + Enter shows it.
- [ ] **Step 2:** `pnpm test` → FAIL. **Step 3:** implement. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit `feat: explain the default colour with a touch-friendly help popover`.

---

### Task 6: Narrow screens (model: Sonnet, effort: high)

**Files:**

- Create: `e2e/admin/editor-usability.spec.ts`
- Modify: the admin components or layout that cause the overflow (found in Step 2), e.g. `components/admin/article-section.tsx`, `components/admin/accessory-section.tsx`, `app/admin/(protected)/layout.tsx`

**Interfaces:**

- Consumes: Tasks 2–5 markup.

- [ ] **Step 1: Write the failing e2e test** `(6c SC-6)`: for widths 390 and 360 (height 844), logged in (admin project), `/admin/produkte/1` and `/admin/kategorien/1`: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
- [ ] **Step 2:** `pnpm db:reset && pnpm build && pnpm e2e e2e/admin/editor-usability.spec.ts` → FAIL; find the elements wider than the viewport (e.g. evaluate `[...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > innerWidth)`), record the cause in the commit message.
- [ ] **Step 3:** Fix the layout (tables scroll inside their own `overflow-x-auto` wrapper, rows stack below `sm`, no fixed min widths wider than 360 px).
- [ ] **Step 4:** Rebuild, rerun the spec → PASS; `pnpm test && pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit `fix: keep the admin editors within the viewport on phones`.

---

### Task 7: End-to-end tests (model: Sonnet, effort: high)

**Files:**

- Modify: `e2e/admin/editor-usability.spec.ts`, `e2e/admin/products.spec.ts`, `e2e/admin/master-data.spec.ts`, `e2e/admin/product-sections.spec.ts`, `e2e/admin/support.ts`

**Interfaces:**

- Produces (`e2e/admin/support.ts`): a service-role helper that gives an `e2e-` product one article and two colours (`product_color` rows with suffixes "1"/"2", sort order 0/1, first `is_default`), so the public product page shows both swatches. Test data uses the `e2e-` slug prefix so `removeE2eData` cleans it up.

- [ ] **Step 1: Update and add tests:**
  - `products.spec.ts` "create a draft": replace the slug field check with the address line "Adresse: /produkte/moebelteile/{SLUG}" after create. `master-data.spec.ts`: replace the slug field check with "Adresse: /produkte/e2e-kategorie-{run}".
  - `(6c SC-1)`: create "E2E Doppelt {run}" twice in "Möbelteile (Beispiel)" → second editor shows "Adresse: /produkte/moebelteile/e2e-doppelt-{run}-2"; rename it to "E2E Umbenannt {run}", save → address unchanged.
  - `(6c SC-3)`: on a published e2e product, open "Suchmaschinen (optional)", fill "Titel für Suchmaschinen" with "E2E SEO {run}", save → the public product page title contains "E2E SEO {run}".
  - `(6c SC-4)`: on the product from the helper, click "Farbe 2 nach oben", "Farben speichern" → on the public product page the first swatch is the former second colour. Drag row 1's handle below row 2 with the mouse (`page.mouse` down on the handle centre, move in ≥ 10 steps to below row 2, up), save → order back to the original on the public page. In `product-sections.spec.ts`, drag "Bild 3" above "Bild 1" by its handle, save → the public gallery's first image has that alt text. Touch: with `hasTouch: true`, press-and-hold (≥ 250 ms) on a handle and move via CDP `Input.dispatchTouchEvent` → order changes; if this cannot be made reliable in Chromium, mark it `test.fixme` with the reason and report it for the manual check in the Gate 2 report.
  - `(6c SC-5)`: at 390 × 844 with `hasTouch: true`, `tap()` on "Was bedeutet Standard?" → the D5 text is visible.
- [ ] **Step 2:** Full run against the local stack: `pnpm db:reset && pnpm build && pnpm e2e` → exit 0 (except a documented `test.fixme`).
- [ ] **Step 3:** Commit `test: e2e for the editor usability changes`.

---

## Not in this plan (handled by `/abschluss`)

Final review (`code-reviewer`), the UI check with login against the local stack and placeholder images in the local Storage (spec D8, SC-7), roadmap "done" and CLAUDE.md status after the developer's approval.

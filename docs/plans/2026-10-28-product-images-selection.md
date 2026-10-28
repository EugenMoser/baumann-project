# Feature 4b — Product page: images & selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharp, never-upscaled product images (tiles, gallery with a scroll-snap slider) and a selection block where article and colour decide the order number the inquiry link carries; all SKUs stay reachable without JavaScript in a collapsed list.

**Architecture:** Image choice moves into pure pickers in `lib/catalog/media.ts` that loaders call; `ProductImage` stops stretching images. The product page wraps everything in one client selection context (article + colour) fed with plain maps computed on the server (`lib/catalog/variants.ts`). The slider is a small client component around server-rendered slides.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Tailwind 4, Supabase (local stack for tests), Vitest + Testing Library, Playwright, pnpm 10.

**Spec:** `docs/specs/2026-10-28-product-images-selection-design.md` (absolute: `/Users/eugen/Projects/baumann-demo/.claude/worktrees/feat+product-images-selection/docs/specs/2026-10-28-product-images-selection-design.md`). Read D1–D8 before your task.

## Global Constraints

- Work only in the worktree `/Users/eugen/Projects/baumann-demo/.claude/worktrees/feat+product-images-selection` on branch `feat/product-images-selection`. pnpm only, never npm.
- No new dependencies.
- Read the relevant guide in `node_modules/next/dist/docs/` before touching `next/image` or client components (Next.js 16 differs from older versions).
- Tests carry the spec IDs of this feature as `(4b SC-n)` in the `describe`/`test` title, so they are not confused with the catalog spec's IDs.
- UI copy (German, exact): "Vorheriges Bild", "Nächstes Bild", "Produktbilder", "Abb. {n} · {alt text}", "{n} / {total}", "Artikel", "Farbe", "Bestell-Nr.", "Anfrage stellen →", "Alle Bestellnummern ({count})", "Listenbild".
- Every product image is rendered at most at its intrinsic `width`/`height` (D1). No `w-full`/`h-full` on the `<img>`.
- Register and search rows keep the list image (`pickThumbnail`), never gallery images.
- Product pages stay ISR (`revalidate = 3600`), no search params, no `searchParams` access.
- Never remove the demo notice or `noindex`. Never commit images or Storage files.
- Tests and e2e run only against the local Supabase stack, never the preview database. E2E: `pnpm db:start && pnpm db:reset`, then build with `NEXT_PUBLIC_SUPABASE_URL` = `API_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `ANON_KEY` from `pnpm exec supabase status -o json` (and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`), then `pnpm e2e` (use `E2E_PORT=3100` if 3000 is taken).
- The worktree has an ignored `.env.local` that points at the local stack (`http://127.0.0.1:54321`, its `ANON_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`), so `pnpm build`, `pnpm dev` and `next typegen` in the worktree use the local stack. Never edit it to point elsewhere; never read or touch the main checkout's `.env.local`.
- Commit after each task with a Conventional Commit message; Husky runs gitleaks, lint-staged, typecheck and tests.

## Review Focus

1. Article numbers with a slash or spaces ("99211/80") in the hash: `#artikel-99211-80` must preselect "99211/80" → Task 6 test.
2. Mixed image sizes in one gallery (465 × 200 next to an 800 × 600 admin upload): every slide keeps the same box ratio and each image stays within its own intrinsic size → Task 4 test.
3. A product colour without suffix: the selected order number is the bare article number for that colour, not the fallback of another colour → Task 5 test.
4. An article that lacks a value for a differing attribute: its option label uses the values it has, else the name, else the number → Task 5 test.
5. The hash changes after load (link to `#artikel-…` on the same page): the selection follows the `hashchange` → Task 6 test.

---

### Task 1: Docs bootstrap (model: Haiku, effort: low)

**Files:**

- Add: `docs/specs/2026-10-28-product-images-selection-design.md` (already copied into the worktree, untracked), `docs/plans/2026-10-28-product-images-selection.md` (this file, untracked)
- Modify: `docs/roadmap.md` (row 4b: status `open` → `in progress`, append " — [spec](specs/2026-10-28-product-images-selection-design.md)" to the description like other rows)
- Modify: `docs/specs/2026-10-09-public-catalog-design.md` (rows FR-4 and FR-5: append "Corrected by [feature 4b](2026-10-28-product-images-selection-design.md) (D1, D3, D4, D5)." to the requirement cell; rows FR-5/SC-5 and FR-7/SC-7: append "Re-stated in feature 4b, D5." to the success-criteria cell)

- [ ] **Step 1:** Make the edits above; keep the Markdown tables valid (run `pnpm exec prettier --write` on the three docs).
- [ ] **Step 2:** `git add docs/ && git commit -m "docs: add spec and plan for feature 4b"`

---

### Task 2: Image pickers, size cap, tile and JSON-LD images (model: Sonnet, effort: medium)

**Files:**

- Modify: `lib/catalog/media.ts`, `lib/catalog/types.ts`, `lib/catalog/categories.ts`, `lib/catalog/search.ts`, `lib/catalog/product.ts`, `lib/catalog/fixtures.ts`
- Modify: `components/catalog/product-image.tsx`, `components/catalog/product-tile.tsx`
- Modify: `components/catalog/article-table.tsx`, `app/globals.css` (token follow-up)
- Test: `lib/catalog/media.test.ts`, `lib/catalog/structured-data.test.ts`, `components/catalog/product-image.test.tsx`, new `components/catalog/product-tile.test.tsx`, `lib/catalog/search-thumbnails.test.ts`, `lib/catalog/overview.test.ts` (adjust only if types change)

**Interfaces:**

- Produces (in `lib/catalog/media.ts`):
  - `export const TILE_MEDIA = "product_media(role, sort_order, media(storage_path, width, height, alt_text))" as const;` — used by `PRODUCT_TILE` (`categories.ts`) and the select in `withThumbnails` (`search.ts`). Build `PRODUCT_TILE` as a template literal with `as const` so supabase-js keeps the literal select type; `pnpm typecheck` proves it.
  - `export function galleryRows<T extends { role: MediaRole; sort_order: number }>(rows: readonly T[]): T[]` — D1: all `gallery` rows by `sort_order`; without any, the first `thumbnail` row (by `sort_order`) alone; `[]` without rows.
  - `export function pickTileImage(rows: readonly MediaRow[]): ImageRef | null` — first of `galleryRows(rows)` as `ImageRef`, else `null`.
  - `pickThumbnail` unchanged.
- Produces (types): `ProductSummary` gains `tileImage: ImageRef | null` (keeps `thumbnail`). `ProductPage.media` now holds `galleryRows(...)` mapped to `MediaView` (gallery only, thumbnail as fallback). `makeProductPage` sets `tileImage: null`.
- `buildProductGroup` keeps reading `page.media`; it now yields gallery images because `page.media` changed.

- [ ] **Step 1: Write failing tests**
  - `media.test.ts` `describe("galleryRows / pickTileImage (4b SC-1)")`: rows `[thumb(sort 0, "a.webp"), gallery(sort 2, "c.webp"), gallery(sort 1, "b.webp")]` → `galleryRows` returns b, c; only thumbnails `[thumb(1,"y"), thumb(0,"x")]` → `[x]`; `[]` → `[]`; `pickTileImage` returns b's `ImageRef`, the thumbnail when no gallery, `null` for `[]`. `pickThumbnail` tests stay green.
  - `structured-data.test.ts` `(4b SC-1)`: a page whose `media` is two gallery images lists exactly their two URLs in `image`, in order.
  - `product-image.test.tsx` `(4b SC-1)`: for each variant `tile`, `detail`, `thumb` with an `ImageRef` of 80 × 80, the `<img>` has `width="80"` and `height="80"`, its class list contains `max-w-full`, `max-h-full`, `object-contain` and contains neither `w-full` nor `h-full`.
  - `product-tile.test.tsx` `describe("ProductTile (4b SC-2)")`: renders `tileImage` (alt text of the tile image, not of `thumbnail`), the link has no class starting with `rounded`, the image box has `aspect-[2/1]`; with `tileImage: null` it shows "Kein Bild".
  - `search-thumbnails.test.ts` `(4b SC-2)`: a row with thumbnail and gallery still yields the thumbnail.
- [ ] **Step 2:** `pnpm test -- lib/catalog components/catalog` → new tests FAIL.
- [ ] **Step 3: Implement**
  - Pickers and `TILE_MEDIA` as above; `toProductSummaries` sets `tileImage: pickTileImage(p.product_media)`; `product.ts` sets `tileImage` and builds `media` from `galleryRows(row.product_media)` (replace the current thumbnail-first sort).
  - `ProductImage`: box classes `flex items-center justify-center bg-surface` plus per variant `tile: "w-full aspect-[2/1] p-3"`, `detail: "w-full aspect-[2/1] p-6"`, `thumb` unchanged size; `<img>` class `max-h-full max-w-full object-contain mix-blend-multiply` (the `width`/`height` attributes give the intrinsic cap; preflight supplies `height: auto`).
  - `ProductTile`: uses `product.tileImage`; drop `rounded-lg`.
  - Token: add `--color-accent-soft: #fff6ef;` next to the other colour tokens in `app/globals.css`; replace both `#fff6ef` literals in `article-table.tsx` with the token utility (`bg-accent-soft` or the `var(--color-accent-soft)` form the file already uses for arbitrary values).
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS. `grep -rn "fff6ef" components app` → only `app/globals.css`.
- [ ] **Step 5:** Commit `feat: pick gallery images for tiles and never upscale product images`.

---

### Task 3: Seed data for the image cases (model: Sonnet, effort: high)

**Files:**

- Modify: `supabase/seed.sql`
- Test: `supabase/tests/*.sql` and `tests/integration/*` only if a count breaks (update to the new seed, do not weaken)

- [ ] **Step 1:** Extend the `media` insert (ids 3–5) and the `product_media` insert:
  - `(3, 'products/testkeil-2.webp', 465, 200, 'Testkeil mit Dämpfung, Draufsicht')`, `(4, 'products/testkeil-3.webp', 465, 200, 'Testkeil mit Dämpfung, Einbaubeispiel')`, `(5, 'products/testrohrschelle-1.webp', 80, 80, 'Testrohrschelle')`
  - `product_media`: `(1, 3, 'gallery', 1)`, `(1, 4, 'gallery', 2)`, `(2, 5, 'thumbnail', 0)`; product 3 "Testabdeckung" stays without images.
- [ ] **Step 2:** `pnpm db:start && pnpm db:reset && pnpm db:test` → exit 0 (fix counts that the new rows legitimately change).
- [ ] **Step 3:** Commit `test: seed gallery images and a small list image`.

---

### Task 4: Gallery and slider (model: Sonnet, effort: medium)

**Files:**

- Modify: `components/catalog/gallery.tsx` (server)
- Create: `components/catalog/gallery-slider.tsx` (`"use client"`)
- Test: new `components/catalog/gallery.test.tsx`

**Interfaces:**

- Consumes: `ProductPage.media` (gallery only, Task 2), `ProductImage` variant `detail`.
- Produces: `Gallery({ media, name }: { media: MediaView[]; name: string })` (signature unchanged); `GallerySlider({ total, children }: { total: number; children: ReactNode })` where `children` are the `<li>` slides.

Behaviour (spec D3):

- 0 images: `ProductImage` with `image={null}` (fallback box). 1 image: one `<figure>` with `ProductImage variant="detail" preload` and `<figcaption>` "Abb. 1 · {alt}". No slider markup.
- ≥ 2 images: `Gallery` renders `<GallerySlider total={n}>` with one `<li>` per image (`<figure>` + caption "Abb. {i} · {alt}"; first image `preload`, others not). The slider renders a `<ul>` track: `role="region"`, `aria-label="Produktbilder"`, `tabIndex={0}`, `flex overflow-x-auto snap-x snap-mandatory`, slides `w-full shrink-0 snap-start`. Index = `Math.round(scrollLeft / clientWidth)`, updated on `scroll`. Buttons "Vorheriges Bild"/"Nächstes Bild" call `scrollTo({ left: target * clientWidth, behavior })` with `behavior` `"smooth"` only when `matchMedia("(prefers-reduced-motion: no-preference)")` matches; disabled at the ends. Indicator "{index+1} / {total}" in mono. Buttons and indicator render only after mount (a `mounted` flag) inside a row whose height is reserved in the server HTML, so nothing shifts.
- The old thumbnail grid goes.

- [ ] **Step 1: Write failing tests** `describe("Gallery (4b SC-3)")`:
  - one image → one `img`, caption "Abb. 1 · …", no button named "Nächstes Bild", no region "Produktbilder".
  - three images (465 × 200, 800 × 600, 465 × 200 — Review Focus 2) → region "Produktbilder" with three `listitem`s, captions "Abb. 1 · …" to "Abb. 3 · …", each `img` keeps its own `width`/`height` attributes, all three image boxes have the same `aspect-[2/1]` class.
  - after mount: "Vorheriges Bild" disabled, "Nächstes Bild" enabled, indicator "1 / 3"; stub the track's `clientWidth` (300) and `scrollTo` (record calls); click "Nächstes Bild" → `scrollTo` called with `left: 300`; set `scrollLeft = 600`, fire `scroll` → indicator "3 / 3", "Nächstes Bild" disabled.
  - zero images → "Kein Bild".
- [ ] **Step 2:** `pnpm test -- components/catalog/gallery` → FAIL.
- [ ] **Step 3:** Implement as described.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5:** Commit `feat: product gallery with a scroll-snap slider`.

---

### Task 5: Selection logic (model: Sonnet, effort: medium)

**Files:**

- Modify: `lib/catalog/variants.ts`, `lib/catalog/attribute-summary.ts`, `components/catalog/article-table.tsx` (import the moved formatter)
- Test: `lib/catalog/variants.test.ts`, `lib/catalog/attribute-summary.test.ts`

**Interfaces:**

- Produces:
  - `export function formatAttributeValue(value: number | string, unit: string | null): string` in `attribute-summary.ts` — moved from `article-table.tsx` (`formatValue`), same output.
  - `export type ArticleOption = { articleNumber: string; label: string };`
  - `export function articleOptions(articles: ArticleView[]): ArticleOption[]` — D4 label rule. Differing keys = keys in `attributeColumns(articles)` order whose values are not identical across all articles (an article without the key counts as different). Label = `"{number} · {v1} · {v2}"` with the first two differing keys the article has (formatted with `formatAttributeValue`); none → `"{number} · {name}"`; no name → `"{number}"`.
  - `export function orderNumberFor(byArticle: VariantMatrix["byArticle"], articleNumber: string | null, colorKey: string | null): string | null` — `null` when `articleNumber` is `null` or unknown; else `numbers[colorKey]` when present, else the article's `fallback`.
  - Remove `orderBoxNumbers` and its tests (replaced by `orderNumberFor`; its last caller goes in Task 6).
- Consumes: `buildVariantMatrix`, `attributeColumns` (unchanged).

- [ ] **Step 1: Write failing tests** `describe("articleOptions (4b SC-4)")`:
  - Testkeil fixture (99010 height 8, 99011 height 10, unit mm) → `["99010 · 8 mm", "99011 · 10 mm"]`.
  - identical attributes on both articles, names "Kappe A"/"Kappe B" → `"… · Kappe A"`; name `null` → number only.
  - three differing keys → only the first two values appear, in column order.
  - Review Focus 4: article B lacks the only differing key → B's label is `"{number} · {name}"`.
  - `describe("orderNumberFor (4b SC-4)")`: known article + colour → that number; colour `null` → fallback; unknown colour → fallback; `articleNumber` `null` → `null`; Review Focus 3: a colour whose variant has no suffix maps to the bare article number for that colour key (build via `buildVariantMatrix` with a `variants` row `orderNumber: "99010"`, `suffix: null`, `colorId` set) and is returned instead of another colour's fallback.
  - `formatAttributeValue` keeps the article-table outputs (one test: `8`, "mm" → "8 mm"; `9.5`, "mm" → "9,5 mm"; `"glatt"`, null → "glatt").
- [ ] **Step 2:** `pnpm test -- lib/catalog` → FAIL.
- [ ] **Step 3:** Implement; `article-table.tsx` imports `formatAttributeValue`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS (the page still compiles: keep `orderBoxNumbers` removal and the page edit in Task 6 if removal breaks the build now — in that case remove it in Task 6 and say so in the report).
- [ ] **Step 5:** Commit `feat: order number and option labels for article selection`.

---

### Task 6: Selection block and page wiring (model: Sonnet, effort: high)

**Files:**

- Modify: `components/catalog/color-selection.tsx` (context for article + colour)
- Create: `components/catalog/selection-block.tsx` (replaces `order-box.tsx`; delete `order-box.tsx`)
- Modify: `app/(site)/produkte/[category]/[product]/page.tsx`
- Test: `components/catalog/color-selection.test.tsx`, new `components/catalog/selection-block.test.tsx`

**Interfaces:**

- Consumes: `articleOptions`, `orderNumberFor`, `ArticleOption` (Task 5); `buildVariantMatrix`; `articleAnchorId` (`lib/catalog/anchors.ts`); `inquiryPath` (`lib/inquiry/path.ts`).
- Produces (`color-selection.tsx`, client):
  - `SelectionProvider({ defaultColor, articles, children }: { defaultColor: string | null; articles: string[]; children: ReactNode })` — state `color` (= `defaultColor`), `article` (= `articles[0] ?? null`). On mount and on `hashchange`: if `location.hash === "#" + articleAnchorId(n)` for some `n` in `articles`, select `n`; otherwise leave the selection.
  - `useSelection(): { color: string | null; article: string | null; selectColor(key: string): void; selectArticle(n: string): void } | null`
  - `ColorPicker({ options })` — as today; renders `null` without provider or with `options.length === 0`.
  - `SelectedOrderNumber({ numbers, fallback })` — colour only (article table), as today.
  - `ArticleSelect({ options }: { options: ArticleOption[] })` — `null` for fewer than two options; visible `<label>` "Artikel" bound to a native `<select>`; options in given order, value = article number.
  - `SelectedResult({ byArticle }: { byArticle: VariantMatrix["byArticle"] })` — number from `orderNumberFor(byArticle, article, color)` in mono inside an `aria-live="polite"` element, plus the inquiry link "Anfrage stellen →" to `inquiryPath(number)`; with `null` number: no number, link to `/anfrage`. Outside a provider: first article's fallback (server default).
  - Remove `ColorSelectionProvider` and `InquiryLink` (replaced).
- Produces (`selection-block.tsx`, server): `SelectionBlock({ articleOptions, colorOptions, byArticle }: { articleOptions: ArticleOption[]; colorOptions: ColorOption[]; byArticle: VariantMatrix["byArticle"] })` — `<section aria-label="Bestellung">` with `ArticleSelect`, `ColorPicker`, then the result row (label "Bestell-Nr." + `SelectedResult`), styled like the 4a order box.
- Page: always wrap the selection area and the article table in `SelectionProvider defaultColor={matrix.defaultKey} articles={page.articles.map(a => a.articleNumber)}`; replace `ColorPicker` + `OrderBox` with `SelectionBlock`.

- [ ] **Step 1: Write failing tests**
  - `selection-block.test.tsx` `describe("SelectionBlock (4b SC-4)")` with the Testkeil matrix (colours `color-3` braun suffix 1 default, `color-1` weiß suffix 2; articles 99010, 99011): default shows "99010 - 1" and the link `href` contains `bestellnummer=99010%20-%201`; choose option "99011 · 10 mm" and radio "weiß" → "99011 - 2" and `bestellnummer=99011%20-%202`; one article → no combobox "Artikel"; no colours → no group "Farbe" and the bare number; no articles → no "Bestell-Nr.", link `href="/anfrage"`.
  - `color-selection.test.tsx` `describe("SelectionProvider hash (4b SC-4)")`: `location.hash = "#artikel-99011"` before render → "99011 …" selected; unknown hash → default; Review Focus 1: articles `["99211/80", "99211/90"]`, hash `#artikel-99211-90` → "99211/90"; Review Focus 5: after render set hash and dispatch `hashchange` → selection follows. Existing ColorPicker/SelectedOrderNumber tests move to `SelectionProvider` and stay green.
- [ ] **Step 2:** `pnpm test -- components/catalog` → FAIL.
- [ ] **Step 3:** Implement; delete `order-box.tsx`; remove `orderBoxNumbers` if Task 5 left it.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` (build with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and the local Supabase overrides) → exit 0.
- [ ] **Step 5:** Commit `feat: choose article and colour for the inquiry`.

---

### Task 7: Collapsed order-number list (model: Sonnet, effort: medium)

**Files:**

- Modify: `components/catalog/order-number-list.tsx`, `app/(site)/produkte/[category]/[product]/page.tsx`
- Test: `components/catalog/order-number-list.test.tsx`

**Interfaces:** `OrderNumberList({ page })` keeps its props; renders a `<details>` (closed, no `open`) with `<summary>` "Alle Bestellnummern ({page.variants.length})" and the existing list (order-number links to the inquiry, colour names). No `<h2>`, no `<section>` heading. The page renders it inside the "Artikel" section directly below `ArticleTable`; the old standalone section goes.

- [ ] **Step 1: Write failing tests** `describe("OrderNumberList (4b SC-5)")`: summary text "Alle Bestellnummern (4)" for the fixture's four variants; the `details` element has no `open` attribute; every order number is in `details.textContent`; every number links to `inquiryPath(number)`; no heading named "Alle Bestellnummern".
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5:** Commit `feat: collapse the order-number list below the article table`.

---

### Task 8: Admin image labels (model: Sonnet, effort: medium)

**Files:**

- Create: `lib/admin/media-placement.ts`, `lib/admin/media-placement.test.ts`
- Modify: `components/admin/image-section.tsx`, `components/admin/image-section.test.tsx`

**Interfaces:** `export function placementNote(rows: readonly { mediaId: string }[], thumbnailId: string, index: number): string` — exact strings (spec D6):

- row is the list image and other rows exist → "Suche, Kategorieübersicht"
- row is the list image and the only row → "Suche, Kategorieübersicht, Produktseite, Kachel"
- n-th non-list row (1-based, in row order) → n = 1: "Produktseite (Bild 1), Kachel"; n > 1: "Produktseite (Bild {n})"

`ImageSection`: radio label "Vorschaubild" → "Listenbild"; intro paragraph replaced by the D6 text verbatim; each row shows `placementNote(rows, thumbnailId, i)` as a muted note, computed from the live `rows`/`thumbnailId` state.

- [ ] **Step 1: Write failing tests**: `media-placement.test.ts` `(4b SC-6)` covers the four cases incl. a list image in the middle of three rows (the rows after it are Bild 1 and Bild 2). `image-section.test.tsx` `(4b SC-6)`: radio "Listenbild" exists, intro text matches D6, notes update after "Bild 2 nach oben" and after checking another "Listenbild" radio.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5:** Commit `feat: name admin image roles by where they appear`.

---

### Task 9: End-to-end tests (model: Sonnet, effort: high)

**Files:**

- Modify: `e2e/catalog.spec.ts`, `e2e/admin/product-sections.spec.ts`, other e2e specs only where the new seed or markup legitimately changes them

Constants: `PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung"`, `PIPE = "/produkte/sanitaer/testrohrschelle"`, `COVER = "/produkte/moebelteile/testabdeckung"`.

- [ ] **Step 1: Update/add tests** (behaviour changes are intended by D1, D4, D5):
  - `(4b SC-2)`: on `/produkte/moebelteile` the Testkeil tile image has alt "Testkeil mit Dämpfung, Draufsicht"; on `/produkte/sanitaer` the Testrohrschelle tile `img` bounding box width ≤ 80; search `/suche?q=Testkeil` row image alt "Testkeil mit Dämpfung, Seitenansicht" (list image).
  - `(4b SC-1)`, replacing "seeded image renders with intrinsic size (SC-10)": on `PRODUCT`, image "…Draufsicht" has `width="465"` `height="200"` and bounding-box width ≤ 465; "…Seitenansicht" is not on the product page; on `PIPE` the image's bounding-box width ≤ 80.
  - `(4b SC-3)`: on `PRODUCT` click "Nächstes Bild" → text "2 / 2" visible, "Nächstes Bild" disabled, slide 2 in viewport.
  - `(4b SC-4)`: on `PRODUCT` select "99011 · 10 mm" in combobox "Artikel", click "weiß" → region "Bestellung" contains "99011 - 2"; click "Anfrage stellen" → the inquiry form's order-number field has value "99011 - 2". `PRODUCT#artikel-99011` → combobox value "99011". Adjust "order box follows the colour" and "colour picker switches" tests to the new block.
  - `(4b SC-5)` in the JavaScript-disabled block, replacing "all order numbers are in the HTML (SC-5)": no heading "Alle Bestellnummern"; the four numbers are in `page.locator("details").textContent()`; after clicking the summary they are visible. `(4b SC-3)` no-JS: two slides in the DOM, track `scrollWidth > clientWidth`.
  - SC-7 test: compare SKUs against `page.locator("body").textContent()` instead of `innerText()`.
  - "product page shows every article and order number": only the default-colour numbers ("99010 - 1", "99011 - 1") must be visible; all four in body text content.
  - `e2e/admin/product-sections.spec.ts` "edit alt text and order": radio "Listenbild"; after saving, the public product page HTML contains `alt="Erstes Bild ${run}"` and not `Zweites Bild neu ${run}`; `/suche?q=${encodeURIComponent(NAME)}` shows a result image with alt `Zweites Bild neu ${run}` (4b SC-6).
- [ ] **Step 2:** Run the full suite against the local stack as in Global Constraints: `pnpm db:reset`, production build with local overrides, `pnpm e2e` → exit 0.
- [ ] **Step 3:** Commit `test: e2e for product images and selection`.

---

## Not in this plan (handled by `/abschluss`)

Final review (`code-reviewer`), UI check with placeholder images in the local Storage (spec D8, SC-8), roadmap "done" and CLAUDE.md status after the developer's approval.

# Feature 4b — Product page: images & selection

- **Status:** for approval (2026-10-28)
- **Roadmap:** feature 4b ([roadmap](../roadmap.md))
- **Estimate:** 9 h
- **Builds on:** feature 4 (catalog pages, variant matrix, JSON-LD), feature
  4a (datasheet design, `ProductImage`, order box), feature 6b (admin image
  section)
- **Corrects:** FR-4 ("gallery, thumbnail first") and FR-5 ("full
  order-number list") of the [catalog spec](2026-10-09-public-catalog-design.md);
  its SC-5 and SC-7 are re-stated here (D5)

## Goal

The product page is what visitors and employers see first, and today two
things on it look broken. Images are blurry: tiles and the product page
upscale the legacy 80 × 80 px list image. The "Anfrage stellen" button
always passes the first article in the default colour, whatever the visitor
picked. In addition, the "Alle Bestellnummern" section means nothing to a
visitor and only exists so that every JSON-LD SKU is visible.

After this feature every image is sharp, because it is never shown larger
than its native size. Visitors choose an article and a colour in one block
next to the gallery, see the resulting order number and send exactly that
number to the inquiry form. Every SKU stays reachable without JavaScript in
a collapsed section below the article table.

## Background: the two image kinds

The legacy catalog has two image kinds per product, and the importer maps
them to the two `product_media` roles:

| Legacy file | Size         | Role        | Admin label today |
| ----------- | ------------ | ----------- | ----------------- |
| `a_…`       | 80 × 80 px   | `thumbnail` | "Vorschaubild"    |
| `b*_…`      | 465 × 200 px | `gallery`   | —                 |

The data model and the role values stay as they are. This feature changes
which role is shown where (D1) and how the admin names the roles (D6).

## Scope

In scope:

- Image choice per place and the "never upscale" rule (D1)
- Product tiles with the first gallery image (D2)
- Product page gallery with a scroll-snap slider (D3)
- Selection block with article and colour, order number and inquiry link (D4)
- "Alle Bestellnummern" section replaced by a collapsed list (D5)
- Admin image section labels (D6)
- Four follow-ups from feature 4a (D7)
- Synthetic seed data for the new cases (D8)
- Docs: catalog spec cross-reference, roadmap, CLAUDE.md status

Out of scope:

- Changes to the data model, RLS, the importer or the role values
- Zoom, lightbox or full-screen view of images
- Image cropping, resizing or size recommendations on upload
- Selection state in the URL (product pages stay ISR without search params)
- Highlighting the selected article in the article table (the `:target`
  highlight from feature 4a stays)
- The search result rows and the category register (they keep the list
  image, see D1)

## Decisions

### D1 — Which image where, never upscaled

| Place                                          | Image                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Product tile (category page, related products) | first `gallery` image (sort order); without one, the `thumbnail`      |
| Product page gallery                           | all `gallery` images (sort order); without any, the `thumbnail`       |
| JSON-LD `image`                                | the same images as the product page gallery                           |
| Search result rows, category register          | `thumbnail` as today (boxes of 56 px and less, where 80 px is enough) |
| No image at all                                | the existing "Kein Bild" fallback box                                 |

**Never upscale:** every product image is rendered at most at its intrinsic
width and height (`media.width`, `media.height`), centred in its box with
`object-contain`. A box may be larger than the image; the image then sits in
the middle on the `surface` background (feature 4a, D2). This applies to
every `ProductImage` variant. `sizes` values must not make `next/image`
request a source wider than needed; the optimizer never enlarges an image.

Consequences, stated so nobody "fixes" them: an imported product without a
gallery image shows its 80 px list image at 80 px, in the tile and on the
product page. An admin-uploaded product whose only image is a large
`thumbnail` shows that image scaled down, as large as the box allows.

`ProductSummary` keeps the list image for the register and gains the tile
image (or tiles get their own field); the builder decides the shape, but the
register and the search must not switch to gallery images.

### D2 — Product tiles

- The tile image box changes from 4:3 to about 2:1, matching the 465 × 200
  gallery format (exact ratio left to the builder; tiles in a grid keep one
  fixed ratio so rows align).
- The tile loses `rounded-lg` and uses the square corners of the system
  (follow-up from 4a).
- The tile select string exists once: the media part of `PRODUCT_TILE` in
  `lib/catalog/categories.ts` and the select in `withThumbnails`
  (`lib/catalog/search.ts`) share one constant (follow-up from 4a).

### D3 — Product page gallery

- One image: a single image box as today, with the caption "Abb. 1 · {alt
  text}" in mono. No slider controls.
- Several images: a horizontal scroll-snap track, one image per view. Each
  slide carries its own caption "Abb. {n} · {alt text}".
  - Swiping and scrolling work through CSS alone, also without JavaScript.
  - With JavaScript: "Vorheriges Bild" and "Nächstes Bild" buttons (icon
    buttons with these accessible names, disabled at the ends, no wrap
    around) and a mono position indicator "{n} / {total}" that follows
    scrolling.
  - Keyboard: the buttons are focusable; the track is a focusable region
    named "Produktbilder" so arrow keys scroll it natively.
  - Smooth scrolling only under `prefers-reduced-motion: no-preference`.
- All slide boxes share one aspect ratio (about 2:1, like the tiles) so the
  layout does not jump between slides; images follow the D1 rule inside.
- The first image keeps `preload`; the others load lazily.
- The grid of small thumbnails under the main image goes away; the slider
  replaces it.
- No new dependency: the slider is built with CSS scroll snap and a small
  client component.

### D4 — Selection block

The colour picker and the order box from feature 4a become one block in the
info column, below the spec list, in this order:

1. **Artikel** — a native `<select>` with a visible label. One option per
   article in table order. Option text: article number, then up to two
   attribute values that differ between the product's articles, in the
   column order of the article table (global `attribute.sort_order`, as
   loaded today; no new query), with unit and `de-DE` numbers, e.g.
   "99010 · 8 mm". When no
   attribute differs, the article name; when that is empty too, the number
   alone. A product with one article shows no select, only its number in the
   result line (as today).
2. **Farbe** — the existing colour picker, unchanged in look and behaviour.
3. **Result** — mono label "Bestell-Nr." with the order number of the
   selected article in the selected colour, next to "Anfrage stellen →",
   which links to `/anfrage?bestellnummer={that number}`.

Rules:

- Default selection: the first article (table order) and the default colour
  (feature 4, D6). This is what the server renders.
- The view `variant` is article × product colour, so every combination has
  an order number; products without colours use the bare article number.
- Changing article or colour updates the number and the link at once; the
  new number is announced politely to screen readers.
- Arriving with a hash `#artikel-{number}` (exact search hit, feature 4a)
  preselects that article after hydration. An unknown hash is ignored. The
  table row keeps its `:target` highlight.
- The article table keeps its order-number column; it still follows the
  colour selection (feature 4, D4), not the article selection.
- Without JavaScript the controls render with the default selection and do
  nothing when changed, the same rule the colour picker follows today
  (feature 4, D6). The collapsed list (D5) is the path to every other
  number.
- A product without articles shows the block with only the inquiry link to
  `/anfrage` (today's `box === null` branch).

### D5 — Every SKU reachable without JavaScript

- The section "Alle Bestellnummern" with its own heading goes.
- Directly below the article table, a native `<details>` element, closed by
  default, with the summary "Alle Bestellnummern ({count})". Inside: the list
  the section shows today (order number as a link to the inquiry form with
  the colour name next to it), restyled to sit quietly under the table.
- Opening and closing work without JavaScript (native `<details>`).
- Re-stated success criteria of the catalog spec:
  - **SC-5 (catalog):** with JavaScript disabled, every order number of the
    product's `variant` rows is in the page's text content and inside the
    `<details>` element; after opening it, all of them are visible.
  - **SC-7 (catalog):** every `sku` in the page's JSON-LD occurs in the
    page's text content (including the closed `<details>`).
  - Rationale: content behind a disclosure counts as present on the page for
    structured data; the e2e checks switch from `innerText` of `body` to
    text content plus the `<details>` check, because `innerText` skips
    closed `<details>` content.

### D6 — Admin image section

Labels describe where an image appears; role values in the database stay
`thumbnail` and `gallery`.

- The radio "Vorschaubild" becomes "Listenbild".
- The intro text becomes: "Das Listenbild erscheint klein in der Suche und
  in der Kategorieübersicht. Alle anderen Bilder bilden in dieser
  Reihenfolge die Galerie der Produktseite; das erste davon zeigt auch die
  Produktkachel. Ohne Galeriebild nutzen Produktseite und Kachel das
  Listenbild."
- Each image row shows a short muted placement note derived from role and
  position, updated live when the order or the radio changes:
  - list image: "Suche, Kategorieübersicht" (plus "Produktseite, Kachel"
    when the product has no other image)
  - first gallery image: "Produktseite (Bild 1), Kachel"
  - further gallery images: "Produktseite (Bild {n})"
- The admin labels are the only admin change; upload, reorder and save
  behave as in feature 6b.

### D7 — Follow-ups from feature 4a

Taken in because the files change anyway
(`.claude/notes/2026-10-19_nacharbeiten.md`, private):

- Square tile corners and the shared media select constant (D2).
- The highlight colour `#fff6ef` in `components/catalog/article-table.tsx`
  becomes a token `--color-accent-soft` in `app/globals.css`; no literal
  remains.
- The selection block gets its own unit test, including the branch without
  articles (D4, last rule).

### D8 — Seed data

The synthetic seed (`supabase/seed.sql`) gains the cases the tests need, with
synthetic file names and dimensions only (no files in Storage, as today):

- "Testkeil mit Dämpfung" (product 1): its 800 × 600 `thumbnail` stays,
  plus two `gallery` images of 465 × 200 → tile shows gallery image 1,
  product page shows a two-slide slider.
- "Testabdeckung" stays without images → "Kein Bild" fallback.
- "Testrohrschelle" (product 2) gets only a `thumbnail` of 80 × 80 → tile and
  product page show it at 80 px.

Existing tests that count media rows or check the 800 × 600 image are updated
to the new seed, not weakened.

For the UI check only (SC-8), synthetic placeholder images with the seeded
storage paths and dimensions (plain shapes, no customer images) are
generated and uploaded to the local Storage. They are not committed and need
no script in the repo; without them the screenshots would show broken images
and the size rule could not be judged.

## Requirements and success criteria

| ID   | Requirement                         | Success criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | Image choice and size rule per D1.  | **SC-1** (unit): the pickers return the first `gallery` image for tiles, all `gallery` images in sort order for the product page, the `thumbnail` as fallback for both, `null` without images, and the `thumbnail` for register and search; `ProductImage` caps the rendered image at its intrinsic width and height in every variant; the JSON-LD builder lists the gallery images (fallback: thumbnail).                                                                                                                                                                                                 |
| FR-2 | Product tiles per D2.               | **SC-2** (unit): the tile renders the tile image in a box of the new ratio without `rounded-*`; (unit): the media select constant is used by the category, product (related) and search loaders; (e2e): on the seeded category page, the "Testkeil" tile image is gallery image 1; the "Testrohrschelle" tile image renders at 80 px width; register and search rows still show the `thumbnail`.                                                                                                                                                                                                           |
| FR-3 | Gallery and slider per D3.          | **SC-3** (unit): one image renders no slider controls; n images render n slides with captions "Abb. 1 …" to "Abb. n …", the position indicator and two labelled buttons, the first disabled at the start; (e2e): on "Testkeil", "Nächstes Bild" brings slide 2 into view and the indicator reads "2 / 2", "Nächstes Bild" is then disabled; with JavaScript disabled both slides are in the DOM and the track is horizontally scrollable.                                                                                                                                                                  |
| FR-4 | Selection block per D4.             | **SC-4** (unit): option texts follow the D4 rule (differing attributes, name fallback, number only); default selection is first article + default colour; one article renders no select; a product without colours shows the bare number; changing article or colour updates number and link; a known `#artikel-…` hash preselects, an unknown one is ignored; no articles → only the link to `/anfrage`; (e2e): on "Testkeil", choosing article 99011 and the second colour shows "99011 - 2" and the inquiry link opens the form prefilled with "99011 - 2"; opening `…#artikel-99011` preselects 99011. |
| FR-5 | Collapsed order-number list per D5. | **SC-5** (e2e, JavaScript disabled): the heading "Alle Bestellnummern" as a section is gone; all four seeded order numbers are in the text content inside the closed `<details>`; after a click on its summary they are visible; (e2e): every JSON-LD `sku` occurs in the page's text content; (review): the catalog spec's FR-4, FR-5, SC-5 and SC-7 point to this spec.                                                                                                                                                                                                                                  |
| FR-6 | Admin labels per D6.                | **SC-6** (unit): the image section shows "Listenbild", the new intro text and per-row placement notes that follow reorder and radio changes (including the "no other image" case); (e2e): `e2e/admin` image specs pass; the test that makes the second upload the list image (`e2e/admin/product-sections.spec.ts`) is rebuilt for D1: it checks the gallery order on the public product page and finds the list image in the search result row for the product, no longer on the product page (the register shows only the first three products and is not reliable for this).                            |
| FR-7 | Follow-ups per D7.                  | **SC-7** (review): no `#fff6ef` literal in `components/` or `app/`, the token exists in `app/globals.css`; (unit): covered by SC-2 and SC-4.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR-8 | Seed per D8; visual check and docs. | **SC-8** (db): `pnpm db:reset` and `pnpm db:test` pass with the new seed; (ui-check, local stack): screenshots at 1440 px and 390 px of the category page, "Testkeil" (slider, selection block, opened `<details>`), "Testrohrschelle" (80 px image) and "Testabdeckung" (no image); the admin image section at 1440 px (login with the local e2e admin; if that fails, it is listed as open in the Gate 2 report); at 360 px no page scrolls horizontally (existing SC-6 of feature 4a); (review): roadmap shows 4b done and the CLAUDE.md status is updated.                                             |

## Structure

```
components/catalog/product-image.tsx      size cap (D1)
components/catalog/product-tile.tsx       tile image, ratio, corners (D2)
components/catalog/gallery.tsx            single image or slider (D3)
components/catalog/gallery-slider.tsx     client part of the slider (D3)
components/catalog/color-selection.tsx    selection context: article + colour (D4)
components/catalog/order-box.tsx          → selection block (D4)
components/catalog/order-number-list.tsx  → collapsed list (D5)
components/catalog/article-table.tsx      token (D7)
app/(site)/produkte/[category]/[product]/page.tsx  layout wiring (D4, D5)
app/globals.css                           --color-accent-soft (D7)
lib/catalog/media.ts                      pickers (D1)
lib/catalog/categories.ts, search.ts, product.ts, overview.ts  loaders (D1, D2)
lib/catalog/variants.ts                   selection numbers, option texts (D4)
lib/catalog/structured-data.ts            JSON-LD images (D1)
components/admin/image-section.tsx        labels (D6)
supabase/seed.sql                         seed cases (D8)
e2e/catalog.spec.ts, e2e/admin/…          SC-2 … SC-6
docs/specs/2026-10-09-public-catalog-design.md, docs/roadmap.md, CLAUDE.md
```

File names are a guide; the plan may merge or split modules.

## Data flow

No new queries. The tile loaders already fetch all `product_media` rows of a
product with role and sort order; only the picking changes. The product page
already loads all media, variants and articles; the selection block computes
everything from that data on the server and passes plain maps to the client
component (as the colour selection does today).

## New dependencies

None.

## Error handling

| Case                                 | Behaviour                                             |
| ------------------------------------ | ----------------------------------------------------- |
| Product without any image            | "Kein Bild" box in tile and gallery (as today)        |
| Product with only a `thumbnail`      | That image in tile and gallery, never upscaled        |
| One gallery image                    | Single box, no slider controls                        |
| Product without colours              | No colour picker, bare article number                 |
| Product with one article             | No article select                                     |
| Product without articles             | Block with only the inquiry link to `/anfrage`        |
| Hash names no article of the product | Ignored, default selection                            |
| JavaScript disabled                  | Default selection, swipeable slider, `<details>` list |

## Risks

- **E2E selectors tied to markup:** the order box, the colour picker and the
  order-number section change markup; tests are adjusted for markup, never
  for behaviour, except where D1, D4 and D5 change behaviour on purpose
  (order numbers of other colours are no longer visible by default; the list
  image leaves the product page when gallery images exist).
- **Hydration:** reading the hash on the server is impossible; it is read
  after mount, so the server and first client render agree.
- **Scroll snap differences between browsers:** the indicator is derived
  from the scroll position, not from button clicks, so swipe and buttons
  stay in sync; checked in Chromium (e2e) and by screenshot at 390 px.
- **`next/image` and small sources:** with the size cap, `sizes` must not
  request larger variants than the source; the optimizer does not enlarge,
  but wrong `sizes` would waste bandwidth.
- **Next.js 16 conventions:** read the bundled docs in
  `node_modules/next/dist/docs/` before touching `next/image` or client
  boundaries.

## Deviations

None yet.

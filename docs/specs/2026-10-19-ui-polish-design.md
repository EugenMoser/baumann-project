# Feature 4a — UI polish

- **Status:** approved design (2026-10-19)
- **Roadmap:** feature 4a ([roadmap](../roadmap.md))
- **Estimate:** 10 h
- **Builds on:** feature 4 (catalog pages, tokens in `app/globals.css`, site
  shell), feature 5 (quality and inquiry pages), features 6a/6b (admin with
  shadcn/ui tokens)

## Goal

Make the preview presentable to employers and prospective clients. The public
catalog gets one consistent, deliberate look, "datasheet": precise
typography, numbers in a monospace face, hairline rules, a single signal
colour, product images on a calm surface. It should read as a well-made
technical catalogue for 281 article numbers, not as a template. Behaviour,
data and URLs stay as they are; this feature changes presentation, plus a few
derived values the new layout shows (counts, attribute summaries).

The direction was chosen from three mockups (datasheet, brand relaunch,
bold/industrial). The developer approved the datasheet direction with two
changes: product images sit on the plain surface of the relaunch mockup
instead of millimetre paper, and the home page shows no product image. The
approved mockup is kept locally (outside the repo) and handed to the
implementer; this spec carries everything binding.

## Scope

In scope:

- Design tokens and fonts (D1), accessibility rules (D8)
- Site shell: demo banner, header, footer, breadcrumb (D5)
- Home page (D3) with facts from the branding config (D9)
- Product page layout (D2, D4)
- Category overview, category pages, product tiles, search page, quality
  page, inquiry page, not-found and error pages restyled with the system (D5)
- Responsive layout down to 360 px (D6)
- Admin: shared tokens and fonts, header wordmark, spacing consistency (D7)
- Follow-up from the admin: a new product can only be created as a draft (D7)
- Docs: roadmap, `docs/revocation.md` (new branding fields), CLAUDE.md status

Out of scope:

- Gallery behaviour, image selection (large vs. thumbnail) and a slider —
  feature 4b
- Dark mode (feature 4 spec, D9 stays)
- New content: category intro texts are still missing in production and stay
  a separate content task; the layout handles their absence (D3)
- Editable home or content pages, a logo image (the wordmark stays text, see
  D5), animations beyond hover and focus feedback
- Admin layout redesign; admin pages only inherit the system (D7)
- Changes to search, routing, caching, data model or RLS

## Decisions

### D1 — Tokens and fonts

`app/globals.css` keeps the `@theme` approach and the token names the
components already use; values change:

| Token           | Value     | Use                                                |
| --------------- | --------- | -------------------------------------------------- |
| `paper`         | `#ffffff` | page background                                    |
| `surface`       | `#f5f4f1` | image boxes, table header, hover rows, footer      |
| `ink`           | `#14171a` | text, strong rules, dark buttons                   |
| `muted`         | `#5d656e` | secondary text, mono labels                        |
| `line`          | `#dcddd9` | hairlines and borders                              |
| `accent`        | `#d4500f` | decorative only: rules, underlines, markers, focus |
| `accent-strong` | `#b5440d` | text links on hover, primary buttons (white text)  |

`accent` is never used for text (contrast against white ≈ 3.9:1). The
shadcn/ui tokens are remapped onto this palette (`primary` → `accent-strong`,
`ring` → `accent`, the rest by meaning).

Fonts via `next/font/google`, replacing Geist: **Instrument Sans** (400–700)
for text and headings, **IBM Plex Mono** (400–600) for labels, numbers,
breadcrumb and helper text. Article, order and certificate numbers are always
mono. Headings use tight tracking (about −0.02 to −0.035 em); mono labels use
uppercase with wide tracking at 11–12 px.

### D2 — Product images on a calm surface

Every product image sits in an image box with `surface` background, no border
radius larger than the system's (small or none), no grid, no dimension lines.
The image is centred with `object-contain` and padding and blends into the
box (`mix-blend-mode: multiply`) because the legacy images have white
backgrounds. The "no image" fallback uses the same box. Tile boxes keep a
fixed aspect ratio so grids align; the product page box may be wider. Which
image is shown stays as today (4b changes that).

### D3 — Home page

Top to bottom:

1. **Hero without image.** Mono eyebrow with an accent rule:
   "Produktkatalog · {n} Produktgruppen · {m} Artikel" (live counts of
   published product groups and their articles). H1 and lead text from the
   branding config (D9). Large search field (ink border, dark "Suchen"
   button). Below it a mono hint "Direkt zur Nummer: {article number} →
   {product name}" linking to the search for that number; the example is the
   first article of the first product of the first category that has one
   (sort order); the hint is omitted when none exists.
2. **Facts bar** between hairlines: up to four facts from the branding config
   (value in mono, label in muted text), separated by vertical hairlines;
   2 × 2 below `sm`. Omitted when the config has no facts.
3. **Category register:** heading "Kategorien" with a link "Alle Produkte →"
   (`/produkte`). One row per category: two-digit index (01, 02 …) in mono,
   name, a subline (first sentence of the category intro text, cut at a word
   boundary with "…" after about 80 characters, omitted when the intro is
   empty), product group count in
   mono, up to three thumbnails of its first products (sort order) that have
   a thumbnail, and an arrow. The whole row is one link; hover uses `surface`.

### D4 — Product page

- Breadcrumb in mono, current page in `ink`.
- Two columns from `lg`: image box (D2) with a mono caption "Abb. 1 · {alt
  text}" under the first image; the existing gallery thumbnails stay below.
- Info column: mono eyebrow "{category} · {k} Artikel"; H1; subtitle; AI label
  and description as today; a spec list between an ink rule and hairlines
  (mono uppercase terms): material, then up to four attribute summaries, then
  "Artikel: {k} Varianten" (singular for one). Material is the product's
  material; without one, the distinct article materials joined with " / ";
  the row is omitted when there is none.
- **Attribute summary rule:** per attribute (category order) over all articles
  in table order, take the distinct values. Up to six distinct values: list
  them separated by " / " with the unit once at the end ("8 / 9,5 / 11 mm").
  More than six numeric values: "min – max unit". More than six text values:
  omit (the table shows them). Numbers use `de-DE` formatting.
- The colour picker moves into the info column, above an **order box**: mono
  label "Bestell-Nr." with the order number of the first article that has
  one in the selected colour (else the first article's fallback), next to the
  "Anfrage stellen →" button. Both the shown
  number and the inquiry link follow the colour selection; without
  JavaScript the server-rendered default stays (same rule as feature 4, D6).
  Products without colours show the bare number.
- **Article table:** one column per attribute instead of today's single
  "Merkmale" cell (as in the approved mockup): the union of the attribute
  keys of the product's articles in category order, "–" where an article has
  no value, unit in each cell. Column order: Art.-Nr., Bezeichnung, attribute
  columns, Verpackungseinheit, Bestell-Nr. Article material (when it differs
  from the product material), note and description move into the
  Bezeichnung cell as muted second lines, so nothing visible today is lost.
  Mono uppercase header with an ink rule; article numbers mono and bold;
  numeric attribute columns right-aligned with tabular figures; order numbers
  as mono chips on `surface`; the `:target` row (exact search hit) gets a
  light accent background and an accent bar on the left.
- Order number list, accessories and related products below, restyled with
  the system (related products reuse the product tile).

### D5 — Shell and other pages

- **Demo banner:** stays amber, always visible, same texts and links (tests
  unchanged); only spacing and typography follow the system.
- **Header:** text wordmark (`shortName`, bold) plus a mono descriptor from
  the branding config ("Spritzgussteile · Katalog"); nav Produkte, Qualität,
  Anfrage with an accent underline and `aria-current="page"` on the active
  section; search field with mono placeholder; ink rule below the header.
- **Footer:** ink rule on top, `surface` background, mono small text, the
  same links as today.
- **`/produkte`:** same category register as the home page.
- **Category page:** mono eyebrow "Kategorie · {n} Produktgruppen", H1, intro
  text, product tile grid.
- **Product tile:** image box (D2), name, subtitle in muted text; hover turns
  the border `ink` and the name `accent-strong`.
- **Search page:** results as register rows (thumbnail, name, subtitle,
  matched number in mono); empty and error states keep their texts.
  `search_catalog` stays unchanged; the search loader fetches the thumbnails
  for the hit slugs in a second read query (RLS as for tiles). Hits without a
  thumbnail show the small fallback box.
- **Quality and inquiry pages, not-found, error:** same header pattern
  (eyebrow, H1, lead), form fields with square corners, `ink` focus border and
  the accent focus ring, helper and error texts unchanged in wording.

### D6 — Responsive

Works from 360 px without page-level horizontal scrolling. Header: wordmark
and nav in one row, search full width below from small screens. Hero H1
scales with `clamp()`. Facts 2 × 2. Register rows drop the thumbnails below
`sm`. The article table keeps table semantics and scrolls horizontally inside
its container, with the article number column sticky.

### D7 — Admin

The admin inherits fonts and tokens through `globals.css` and the remapped
shadcn variables. The admin header uses the same wordmark with the descriptor
"Admin". No structural changes; only spacing that clashes with the new type
scale is adjusted.

Follow-up from the admin (reported by the developer): on "Neues Produkt" the
status select offers only "Entwurf", with the hint "Artikel, Farben und Bilder
folgen nach dem ersten Speichern." Editing an existing product keeps all
statuses. The server rules stay as they are (publishing without articles is
already refused).

### D8 — Accessibility and motion

WCAG AA contrast for all text, including muted text on `surface`. Focus ring
2 px `accent` with offset on every interactive element. Transitions only on
hover and focus (colour, border, ≤ 150 ms), none under
`prefers-reduced-motion: reduce`. Decorative markers are CSS, not text.

### D9 — Branding content

Customer-specific copy on the new pages comes from `config/branding.ts`, so
the revocation switch to `placeholderBranding` removes it too. New fields:

- `descriptor` — header descriptor, e.g. "Spritzgussteile · Katalog"
- `home.title`, `home.lead` — hero H1 and lead text
- `home.facts` — 0–4 entries `{ value, label }`

Customer values (from the official website): title "Spritzgussteile für
Caravan- und Möbelbau.", a lead about the catalogue and in-house tool-making in
the Allgäu, facts "1984 / gegründet, heute in 2. Generation", "15–220 t /
Schließkraft, Arburg-Maschinen", "Werkzeugbau / Konstruktion und Formenbau im eigenen
Haus" and "ISO 9001 / und ISO 14001 zertifiziert". The placeholder
branding gets neutral texts and no facts.

## Requirements and success criteria

| ID   | Requirement                              | Success criterion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | Tokens, fonts and a11y rules per D1, D8. | **SC-1** (e2e): axe reports no serious or critical violations (including `color-contrast`) on every page of `e2e/a11y.spec.ts` and on the empty search page; (review): `globals.css` matches D1, no Geist import is left, `accent` is not used for text.                                                                                                                                                                                                                                                                                                                                                             |
| FR-2 | Site shell per D5.                       | **SC-2** (unit): the header renders wordmark, descriptor from branding and the three nav links, and marks the active section with `aria-current="page"`; footer and demo banner tests pass unchanged in wording; (e2e): `demo-banner.spec.ts` and `noindex.spec.ts` pass unchanged.                                                                                                                                                                                                                                                                                                                                  |
| FR-3 | Home page per D3.                        | **SC-3** (unit): the home loader returns per category the product group count, at most three thumbnails and the intro subline (empty intro → none), plus total product group and article counts and the example article (none → hint omitted); the facts bar renders branding facts and is absent without facts; (e2e): the hero has no image, the eyebrow counts match the seeded data, each register row links to its category and the hint leads to the product.                                                                                                                                                  |
| FR-4 | Product page per D2, D4.                 | **SC-4** (unit): the attribute summary follows the D4 rule (≤ 6 values joined with one unit, > 6 numeric as a range, > 6 text omitted, `de-DE` numbers); (unit): the article table renders one column per attribute (union of keys, "–" for missing values) and keeps article material, note and description visible; (unit): the order box shows the order number for the selected colour and the inquiry link carries it; (e2e): choosing another colour changes the order box and the inquiry link; an exact article-number search lands on the highlighted row; a product without images shows the fallback box. |
| FR-5 | Other pages per D5.                      | **SC-5** (e2e): `catalog`, `search`, `content` and `inquiry` specs pass with behaviour unchanged (selectors adjusted only where markup changed); the search page lists hits as rows with the matched number; (unit): the search loader attaches thumbnails to hits by slug and leaves hits without one at `null`.                                                                                                                                                                                                                                                                                                    |
| FR-6 | Responsive per D6.                       | **SC-6** (e2e): at 360 × 740 every page of `e2e/a11y.spec.ts` has `document.documentElement.scrollWidth` ≤ 360; on the product page the article table container scrolls horizontally instead.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR-7 | Admin per D7.                            | **SC-7** (unit): the product form for a new product offers only "Entwurf" and shows the hint, the edit form offers all three statuses; (e2e): `e2e/admin` specs, including the admin axe checks, pass.                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR-8 | Branding fields per D9.                  | **SC-8** (unit): customer and placeholder branding parse with the new fields; the placeholder contains no customer name, year or certificate; (review): `docs/revocation.md` names the new fields.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR-9 | Visual check and docs.                   | **SC-9** (ui-check): screenshots at 1440 px and 390 px of home, category, product, search, quality and inquiry match this spec, and of the admin product list and editor at 1440 px; (review): roadmap shows 4a done and the CLAUDE.md status is updated; the developer reviews the preview after deploy.                                                                                                                                                                                                                                                                                                            |

## Structure

```
app/globals.css                         tokens, shadcn mapping (D1)
app/layout.tsx                          fonts (D1)
app/(site)/page.tsx                     home (D3)
app/(site)/produkte/page.tsx            register (D5)
app/(site)/produkte/[category]/…        category and product pages (D4, D5)
app/(site)/{suche,qualitaet,anfrage}/…  restyle (D5)
app/admin/(protected)/produkte/neu/…    draft only (D7)
components/site/{site-header,nav-link,site-footer,breadcrumb,search-form}.tsx
components/catalog/{category-register,facts-bar,product-image,product-tile,
  gallery,article-table,color-selection,order-box,spec-list,…}.tsx
components/demo-banner.tsx              layout only (D5)
components/admin/{admin-header,product-form}.tsx
config/branding.ts                      new fields (D9)
lib/catalog/{home,attribute-summary}.ts loader for D3, summary rule for D4
docs/revocation.md, docs/roadmap.md, CLAUDE.md
```

File names are a guide; the plan may merge small modules.

## Data flow

Unchanged except two read additions. The search loader adds one query for
the thumbnails of the hits (D5). The home page reads, per request as today: categories
with published product count, intro text and the first products' thumbnails;
the total article count of published products; the example article. One or
two queries through the existing catalog client and RLS; no service-role
access. The attribute summary is computed from the product page data already
loaded.

## New dependencies

None. Instrument Sans and IBM Plex Mono come through `next/font/google`, like
Geist today.

## Error handling

| Case                        | Behaviour                               |
| --------------------------- | --------------------------------------- |
| Home loader fails           | Same error page as today                |
| Category without intro text | Register row without subline            |
| Category without thumbnails | Register row without thumbnails         |
| No published article        | Hint omitted, counts show 0             |
| Product without images      | Fallback box (D2)                       |
| Product without colours     | Order box shows the bare article number |
| Branding without facts      | Facts bar omitted                       |

## Prerequisites from the developer

- After deploy: look at the preview (behind basic auth) and give feedback;
  the developer asked to review the result together.

## Risks

- **Subjective result:** the developer reviews after implementation; Gate 2
  includes screenshots so changes can be named precisely.
- **E2E selectors tied to markup:** restyling may break selectors; specs are
  adjusted only for markup, never for behaviour.
- **Font loading at build time:** `next/font/google` fetches during the build
  as with Geist today; CI and the VPS build already do this.
- **`mix-blend-mode` with transparent PNGs** uploaded in the admin: multiply
  leaves them unchanged on the surface, so no special case.
- **Next.js 16 conventions:** read the bundled docs in
  `node_modules/next/dist/docs/` before touching fonts, layouts or client
  boundaries.

## Deviations

- The header descriptor is hidden below `sm` so wordmark and navigation fit one row at 360 px (D5 vs. D6).
- `/produkte` has no breadcrumb; its lead is the former meta description.
- Search result rows keep their single thumbnail on phones; "drop thumbnails below `sm`" (D6) applies to the category register.
- A key with mixed numeric and text values uses the text rule; the unit is appended only when the attribute has one.
- The article material line also shows when only the article's material note differs (D4 "nothing visible today is lost").
- The category eyebrow uses the singular "1 Produktgruppe".
- The article table uses separate cell borders and puts the `:target` accent bar on the sticky first cell (collapsed borders vanish under a sticky column).
- The "Direkt zur Nummer" hint is a plain link (full navigation) so the target row is highlighted.
- The `next dev` agent-rules block is committed in CLAUDE.md.

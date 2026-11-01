# Feature 6c — Admin: editor usability

- **Status:** draft (2026-11-01)
- **Roadmap:** feature 6c ([roadmap](../roadmap.md))
- **Estimate:** 7 h (roadmap 5 h, plus the image list in D4 and the two
  follow-ups in D7 and D8)
- **Builds on:** feature 6a (product editor, colour section), feature 6b
  (category form, image section), feature 4b (image placement notes, PR #15;
  the feature branch starts from `main` after PR #15 is merged)
- **Corrects:** D6 of the [admin products spec](2026-10-10-admin-products-design.md)
  ("the slug … stays editable"; "a taken slug is a field error") and D7 of
  the [admin media & master data spec](2026-10-10-admin-media-master-data-design.md)
  (editable category slug)

## Goal

The admin should be usable by the customer's staff, who maintain a catalog,
not a website. Today the product editor asks for things only a developer
understands: a "Slug" field, two SEO fields that look mandatory, a number
field "Reihenfolge" per colour, and a "Standard" radio without any
explanation. Image order works with ↑/↓ only, and on a phone the editor is
wider than the screen.

After this feature an editor creates a product by typing its name; the
address is made for them. SEO fields wait in a closed, optional section and
show the automatic text they would replace. Colours and images are put in
order by dragging them, with mouse or finger, or with ↑/↓ buttons, and every
row shows its position. Every explanation can be opened by tapping.

## Background: what exists today

| Place                   | Today                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Product form            | Editable "Slug" field, filled from the name on create; a clash is a field error on "Slug" |
| Category form           | Same slug behaviour; slug is unique across all categories                                 |
| SEO fields              | Always visible in both forms, hint "leer = automatisch", no preview of the automatic text |
| Colour section          | One row per colour with a number field "Reihenfolge" and a radio "Standard" without help  |
| Image section           | ↑/↓ buttons per row and placement notes (feature 4b); no visible position number          |
| Product editor at 390px | 18 px wider than the viewport (known since 4b, cause not found)                           |

Public pages read `sort_order` of colours and images as today; the data
model does not change.

## Scope

In scope:

- Server-side slugs for products and categories, no slug field (D1)
- Read-only address line instead of the slug field (D2)
- Collapsible SEO section with the automatic value as preview (D3)
- One sortable list for colours and images: drag and drop plus ↑/↓ (D4)
- Colour section texts and the "Standard" explanation (D5)
- Touch-friendly explanations via a popover (D6)
- No horizontal scrolling of the editor on phones (D7, follow-up from 4b)
- Visual check of the admin with login (D8, follow-up from 4a)
- Docs: admin products spec cross-reference, roadmap, CLAUDE.md status

Out of scope:

- Changing the slug of an existing product or category in the UI; a new
  address for a live page is a developer task (redirects come with go-live,
  roadmap "Later")
- The number fields "Reihenfolge" for products, categories and category
  attributes (they stay as they are)
- A warning for unsaved changes when leaving the editor
- The article dialog, the accessory section and the master data dialogs,
  except where D7 needs a layout fix
- Public pages, data model, migrations, RLS, the importer
- AI origin labels and AI suggestions in the SEO section (feature 7)

## Decisions

### D1 — Slugs are made on the server

- Neither the product form nor the category form renders a slug input. The
  save actions ignore a `slug` field in the form data; the slug never comes
  from the client.
- **Create:** the slug is `slugify(name)`. If that is empty (a name without
  letters or digits), the name gets the field error "Der Name braucht
  mindestens einen Buchstaben oder eine Ziffer."
- **Clash:** the first free slug of `base`, `base-2`, `base-3`, … is taken.
  Scope: within the category for products (unique `(category_id, slug)`),
  across all categories for categories (unique `slug`). The taken slugs are
  read in one query; a pure function picks the first free one. If the
  insert still hits the unique constraint (two editors at the same moment),
  the save reads again and retries a small fixed number of times, then
  shows the generic form error.
- **Rename:** the slug stays unchanged, for products and categories, so
  public addresses and storage paths stay stable.
- **Category change of a product:** the slug is kept if it is free in the
  new category, otherwise it is numbered by the same rule with the current
  slug as base (`rohr` → `rohr-2`; an existing `rohr-2` → `rohr-2-2`). The
  name is not used here, so a category change never rewrites the address
  from a renamed product. The address changes anyway, as today.
- **Length:** a generated base is cut to at most 120 characters (the old
  form limit) at a hyphen where possible, before a number is appended.
- **Saving a category** goes through the existing RPC, which writes the
  slug on every update; the action passes the stored slug, so no migration
  is needed.
- Existing (imported) slugs are never rewritten.

### D2 — Address line instead of the slug field

Where the slug field was, the editor shows a read-only line:

- Existing product: "Adresse: /produkte/{category}/{slug}" and the hint
  "Eine Änderung der Kategorie ändert die Adresse."
- Existing category: "Adresse: /produkte/{slug}".
- Create forms: "Die Adresse entsteht beim Anlegen aus dem Namen."

After a save the line shows the saved address (for example after a
numbered category change).

### D3 — Optional SEO section

- Both forms put SEO title and description into a native
  `<details>` element with the summary "Suchmaschinen (optional)". It is
  closed by default and rendered open when one of its fields has a saved
  value or a field error, so an error is never hidden.
- First line inside: "Leer lassen, dann erzeugt die Seite Titel und
  Beschreibung automatisch. Die Felder zeigen diesen Text als Vorschau."
- Labels: "Titel für Suchmaschinen" (hint "Höchstens 70 Zeichen.") and
  "Beschreibung für Suchmaschinen" (hint "Höchstens 160 Zeichen.").
- Each field's placeholder is the automatic value, computed by the same
  function the public page uses (`lib/catalog/metadata.ts`, extracted into
  a pure function on plain inputs if needed):
  - product: title = name; description from name, subtitle, the saved
    article numbers and the saved colour count;
  - category: title = name; description from the intro text, or
    "{Name}: alle Produkte im Überblick.".
    The placeholder follows name, subtitle and intro text as they are typed.
- A product without articles gets an automatic description without the
  "Artikel …" part (today it would read "Artikel ."). Only the admin sees
  this case, because a product cannot be published without articles. For
  every product with articles the public output stays the same.
- Feature 7 will add its AI suggestion inside this section; nothing is
  prepared for it beyond keeping both fields in one block.

### D4 — One sortable list for colours and images

A shared client component renders both lists.

- Each row shows its position (1, 2, 3, …), a drag handle (grip icon) and
  the ↑/↓ buttons. Button labels follow the existing image pattern
  ("Farbe 2 nach oben", "Bild 2 nach unten").
- **Drag:** only the handle starts a drag. With a mouse the drag starts
  after a few pixels of movement; on touch it starts after press-and-hold
  on the handle (about 200 ms), so swiping anywhere else still scrolls the
  page. The dragged row is visibly lifted; the list scrolls when the row
  nears the viewport edge. Motion respects `prefers-reduced-motion`.
- **Handle is pointer-only:** it is not focusable and hidden from assistive
  technology. Keyboard and screen-reader users reorder with ↑/↓, which is
  also the non-drag alternative of WCAG 2.5.7. The library's built-in
  English screen-reader texts must not appear.
- **Announcement:** every move, by button or by drop, is announced once in
  a polite live region: "{Label} steht jetzt auf Position {n} von {m}." The
  label is the colour name, or for images the alt text, falling back to
  "Bild".
- **Focus:** after a button press focus stays on the pressed button; if it
  becomes disabled at an end, focus moves to the other button of the same
  row (as in the 4b gallery slider).
- Order is saved with the existing "Farben speichern" / "Bilder speichern"
  button; nothing saves automatically.
- **Colours:** the number field "Reihenfolge" goes. The server derives
  `sort_order` from the order of the rows in the form data (0-based, as
  today). Rows get stable keys (today they are keyed by index).
- **Images:** the 4b placement notes stay and follow the new order live.

### D5 — Colour section texts

- The intro keeps the order-number sentence and adds: "Position 1 ist die
  erste Farbe auf der Produktseite."
- The radio keeps the label "Standard" and gets a help button (D6) with the
  accessible name "Was bedeutet Standard?" and the text: "Die Standardfarbe
  ist auf der Produktseite vorausgewählt. Ihre Bestellnummer steht im
  Auswahlblock, bis jemand eine andere Farbe wählt."

### D6 — Explanations that work on touch

- A shadcn Popover (`components/ui/popover.tsx`) on top of `radix-ui`,
  which is already a dependency, plus a small help-button wrapper: an icon
  button with a visible ⓘ-style icon and an accessible name, opening on
  click, tap, Enter and Space; closing on Escape, outside tap and a second
  tap; focus returns to the button.
- No explanation in the editor depends on hover.
- 6c uses it for "Standard"; feature 7 can reuse it.

### D7 — Narrow screens

- At 390 px and 360 px the product editor (with articles, colours, images
  and accessories) and the category form do not scroll horizontally. The
  cause of the known 18 px overflow is found and fixed; likely candidates
  are the six-column colour row, the image row and the article table.
- Colour and image rows stack below `sm`.
- Handle and ↑/↓ buttons are at least 24 × 24 px (WCAG 2.5.8).

### D8 — Visual check of the admin

The UI check logs in with the local e2e admin against the local stack and
takes screenshots at 1440 px and 390 px of the product list, the product
editor (SEO section closed and open, colour section, image section) and the
category form. This closes the 4a follow-up "Admin-Produktliste und -Editor
im neuen Design einmal im Browser ansehen". Forms that write data are only
submitted against the local stack (project rule). Image rows need the
placeholder images used in 4b, uploaded to the local Storage only and not
committed.

## Requirements and success criteria

| ID   | Requirement                           | Success criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | Server-side slugs per D1.             | **SC-1** (unit): the pure function returns `base` when free, otherwise the first free `base-n` (n ≥ 2), and ignores slugs that only share a prefix (`rohrschelle` for base `rohr`); (unit, fake client): product create derives the slug from the name, a clash in the category gives `-2`, a rename keeps the slug, a category change with a clash numbers it, a `slug` in the form data is ignored, a name without letters or digits gives the D1 field error, a concurrent unique violation is retried; category create uses the global scope with the same rules; (e2e): creating a second product with an existing name in the same category gives the address `…/{slug}-2`; renaming a product keeps its address.                                           |
| FR-2 | Forms without slug field per D2.      | **SC-2** (unit): neither form renders an input named `slug`; the product editor shows the address line and the category hint; the category editor shows its address; both create forms show the D2 create hint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR-3 | Optional SEO section per D3.          | **SC-3** (unit): the section is closed with empty fields and open with a saved value or a field error; placeholders equal the automatic value and follow typed name, subtitle and intro text; the automatic product description without articles has no "Artikel" part; (unit): the existing public metadata tests pass unchanged; (e2e): after opening "Suchmaschinen (optional)" a saved product SEO title becomes the public page title.                                                                                                                                                                                                                                                                                                                       |
| FR-4 | Sortable lists per D4.                | **SC-4** (unit): ↑/↓ reorder and update the positions, the first ↑ and last ↓ are disabled, the D4 focus rule holds, each move produces one announcement in the D4 wording, the handle is not focusable and is hidden from assistive technology; colour form data without `sortOrder` fields yields `sort_order` by position; (e2e): moving a colour up with ↑ and saving changes the swatch order on the public product page; dragging a colour row by its handle with the mouse reorders and saves; dragging an image row changes the gallery order; (e2e, Chromium with touch emulation): press-and-hold and move on the handle reorders; if this cannot be automated reliably, the plan replaces it with a manual check whose result is in the Gate 2 report. |
| FR-5 | Texts and help popover per D5 and D6. | **SC-5** (unit): the colour intro contains the position sentence; the help button has the accessible name "Was bedeutet Standard?", opens the text on click and on Enter, closes on Escape and returns focus; (e2e, 390 px with touch): tapping the help button shows the text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR-6 | Narrow screens per D7.                | **SC-6** (e2e, logged in): at 390 px and 360 px the seeded product editor and the category form have `scrollWidth <= clientWidth`; (review): handle and ↑/↓ buttons are at least 24 × 24 px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR-7 | Visual check per D8.                  | **SC-7** (ui-check, local stack): the D8 screenshots at 1440 px and 390 px exist, no console errors; findings are in the Gate 2 report; if the login fails, that is listed as open in the report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR-8 | Docs.                                 | **SC-8** (review): D6 of the admin products spec and D7 of the admin media & master data spec point to this spec; the roadmap row 6c no longer lists open spec questions and shows the status; the CLAUDE.md status is updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Structure

```
lib/catalog/slug.ts                     first free slug (pure) (D1)
lib/admin/products.ts, categories.ts    slug on create, clash retry, category change (D1)
lib/admin/schemas.ts, category-schema.ts  slug out of the form schemas (D1)
app/admin/(protected)/produkte/actions.ts, kategorien/actions.ts  (D1)
components/admin/product-form.tsx       address line, SEO section (D2, D3)
components/admin/category-form.tsx      address line, SEO section (D2, D3)
components/admin/seo-section.tsx        shared SEO block (D3)
lib/catalog/metadata.ts                 automatic values on plain inputs (D3)
components/admin/sortable-list.tsx      drag and drop, ↑/↓, positions, live region (D4)
components/admin/color-section.tsx      sortable rows, texts, help (D4, D5)
lib/admin/color-schema.ts               sort_order from row position (D4)
components/admin/image-section.tsx      sortable rows (D4)
components/ui/popover.tsx               shadcn Popover (D6)
components/admin/help-popover.tsx       help button (D6)
e2e/admin/…                             SC-1, SC-3 … SC-6
docs/specs/2026-10-10-admin-products-design.md, docs/roadmap.md, CLAUDE.md
```

File names are a guide; the plan may merge or split modules.

## Data flow

No new tables or columns. Slug creation adds one read of the taken slugs
before the insert (and before a category change). The SEO placeholders use
data the editor already loads (articles and colours of the product, intro
text of the category). Colour and image order travel as the order of the
rows in the form data, as images already do.

## New dependencies

- `@dnd-kit/core` (6.3.x), `@dnd-kit/sortable` (10.0.x),
  `@dnd-kit/utilities` (3.2.x): mouse and touch sensors with an activation
  delay, sortable lists, React 19 inside the peer range. Considered and not
  chosen: `@dnd-kit/react` 0.5 (the successor, but still pre-1.0) and
  `@hello-pangea/dnd` 18 (larger and more opinionated about markup).
- `components/ui/popover.tsx` via the shadcn CLI; no new npm package,
  because `radix-ui` is already installed.

## Error handling

| Case                                        | Behaviour                                              |
| ------------------------------------------- | ------------------------------------------------------ |
| Name without letters or digits              | Field error on "Name" (D1)                             |
| Slug taken in the scope                     | Numbered `-2`, `-3`, … without a message               |
| Unique violation after the retries          | Generic form error, values stay in the form            |
| Category change to a category with the slug | Slug numbered, address line shows the new address      |
| SEO value too long                          | Field error, section rendered open                     |
| Drag cancelled (Escape, drop outside)       | Order unchanged, no announcement                       |
| JavaScript disabled                         | Admin needs JavaScript (as today); no special handling |
| Tampered `slug` or `sortOrder` in form data | Ignored                                                |

## Risks

- **Touch drag in tests:** Playwright touch emulation and press-and-hold
  sensors do not always work together; SC-4 names the fallback.
- **Placeholder mistaken for a value:** mitigated by the first line of the
  section, which says the fields show a preview.
- **Library screen-reader texts:** the drag library ships English live
  texts; they must be switched off or replaced, otherwise screen readers
  hear English instructions for a handle they cannot reach.
- **E2E selectors:** tests that fill the slug or the colour "Reihenfolge"
  field are rebuilt for the new behaviour, not weakened.
- **No way to fix a typo in an address:** a name typo at creation stays in
  the address after the rename. Accepted for the preview; the developer can
  change it in the database.
- **Next.js 16 conventions:** read the bundled docs in
  `node_modules/next/dist/docs/` before touching forms and client
  boundaries.

## Deviations

- The check "a name needs a letter or digit" (D1) applies on create and on edit; one schema rule is simpler, and such a name is never wanted.

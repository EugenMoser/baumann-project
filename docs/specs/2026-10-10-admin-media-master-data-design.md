# Feature 6b — Admin: images & master data

- **Status:** implemented (2026-10-11)
- **Roadmap:** feature 6b ([roadmap](../roadmap.md)); second half of feature 6
  ([6a spec](2026-10-10-admin-products-design.md), D1)
- **Estimate:** 10 h
- **Builds on:** feature 2 (bucket `catalog`, storage and table policies),
  feature 3 (image import, `products/…` storage paths), feature 4 (gallery,
  thumbnails, accessory list), feature 6a (auth, admin shell, `adminWrite`,
  `fromPg`, origin rule, set functions, revalidation)

## Goal

The admin maintains everything the import used to provide besides attribute
definitions: product images with alt text, thumbnail and order; matching
accessories of a product; categories with their attributes; colours and
materials. Every change is visible on the public site on the next request. No
file is left behind in Storage when an image or a product is deleted.

## Scope

In scope:

- Image section on the product edit page: upload, alt text, thumbnail, order,
  remove
- Image cleanup when a product is deleted, plus `pnpm media:prune` for
  orphans left by 6a
- Alt-text review hint and filter in the product list
- Accessory section on the product edit page
- Categories: list, create, edit (incl. attribute assignment), delete
- Colours and materials: list, create, edit, delete (dialogs)
- Admin nav: Produkte, Kategorien, Farben, Materialien
- Docs: `docs/data-model.md`, `docs/deploy.md`, roadmap

Out of scope:

- Attribute definitions (`attribute`) stay import-managed; categories only
  assign existing attributes (D7)
- Media library or images shared between products; images belong to one
  product (D1)
- Cropping, conversion, several files per upload, drag-and-drop sorting
- AI alt-text suggestions (roadmap "Later"), AI texts (feature 7)
- Colour families as a fixed list; filters on colour families (later)
- Bucket-level size and MIME limits (D3)

## Decisions

### D1 — Images belong to one product

Every uploaded image gets one `media` row and one `product_media` row for its
product. New files go to `products/{product_id}/{uuid}.{ext}`; imported files
keep their slug-based paths. A path never changes after upload, so a slug
change does not touch Storage and `next/image` never serves a stale variant
for a reused path.

### D2 — Upload through a Server Action

The upload form posts the file and its alt text to a Server Action:

1. `checkAdmin()` via `adminWrite` (6a).
2. Validate: alt text 1–250 characters after trimming; file 1 byte to 5 MiB;
   type detected from the bytes with `image-size` (`jpg`, `png`, `webp` only —
   the browser's MIME type and the file name are ignored); width and height
   1–8000 px.
3. Upload with the session client to `catalog/products/{id}/{uuid}.{ext}`
   (`upsert: false`, content type from the detected type). Storage policies
   check `private.is_admin()`.
4. `public.admin_attach_media(p_product_id, p_storage_path, p_width,
p_height, p_alt_text)` inserts `media` (`alt_origin = 'human'`) and
   `product_media` in one transaction: role `thumbnail` if the product has
   none, otherwise `gallery`; `sort_order` = current maximum + 1.
5. If step 4 fails, the action removes the uploaded file (compensation);
   a failed removal is logged (context and storage error, no file name from
   the user).

`next.config.ts` sets `experimental.serverActions.bodySizeLimit` to `"6mb"`
(5 MiB plus multipart overhead). The proxy buffer (`proxyClientMaxBodySize`,
default 10 MB) is large enough. `image-size` moves from `devDependencies` to
`dependencies`. The form checks the size client-side first for a quick
message; the server check is authoritative.

### D3 — No bucket limits

The bucket `catalog` also holds certificate PDFs written by
`pnpm certificates:import`. Bucket-wide MIME and size limits would have to
cover both, so they would add little. Writes are admin-only; the action's
checks (D2) are the limit.

### D4 — Editing images as one set

The image section lists the product's images with a small preview, an alt-text
input, a "Vorschaubild" radio and up/down buttons. "Bilder speichern" sends
the whole set to `public.admin_set_product_media(p_product_id, payload
jsonb)` (`security invoker`), payload `[{media_id, alt_text, alt_origin,
is_thumbnail, sort_order}]`. The function:

- raises `22023` "Die Bildliste ist veraltet. Bitte die Seite neu laden." if
  the media ids differ from the product's current images,
- raises `22023` "Genau ein Bild muss Vorschaubild sein." unless exactly one
  row is the thumbnail,
- raises `22023` "Jedes Bild braucht einen Alt-Text." for an empty alt text,
- sets every row to `gallery` first, then the chosen one to `thumbnail`
  (avoids a transient violation of the one-thumbnail index), and writes alt
  texts and sort orders.

`alt_origin` per image follows the 6a origin rule (`nextOrigin` in
`lib/admin/origin.ts`): unchanged → previous; changed from `human` → `human`;
changed from `ai`/`ai_edited` → `ai_edited`. The action computes it from the
current rows before calling the function.

The public product page already shows the thumbnail first, then the gallery
by `sort_order`; the tile uses the thumbnail. Nothing changes there.

### D5 — Removing images and products cleans up Storage

- **Remove image:** confirmation dialog;
  `public.admin_remove_media(p_product_id, p_media_id)` (`security invoker`)
  deletes the `media` row (`product_media` cascades), promotes the gallery
  image with the lowest `sort_order` to `thumbnail` if the removed one was the
  thumbnail, and returns the `storage_path`; then the action removes the file.
  Order DB first, file second: a broken row would show a broken image
  publicly, an orphan file is invisible.
- **Delete product (6a D10, extended):** `public.admin_delete_product(p_product_id)`
  (`security invoker`) collects the storage paths of the product's media,
  deletes the product (cascade) and the now unlinked `media` rows in one
  transaction and returns the paths. The action then removes the files. The
  6a status check (no deletion of published products) stays in the app and
  in the delete policy.
- Failed file removals are logged and do not fail the action; `pnpm
media:prune` catches them later.

### D6 — `pnpm media:prune`

`scripts/media/prune.mts`, service role from `.env.import` like the importer.
It finds `media` rows without `product_media` and objects under `products/`
without a `media` row that are older than one hour (protects an upload in
flight). Without flags it only prints counts and paths; `--apply` deletes rows
first, then files. Never touches `certificates/`. Exit ≠ 0 on any error.
Needed once for orphans of products deleted in 6a, afterwards as a safety net.

### D7 — Categories

`/admin/kategorien` lists categories (name, slug, product count, sort order).
`/admin/kategorien/neu` and `/admin/kategorien/[id]` share a form: name, slug
(filled from the name with `slugify` on create, editable), intro text
(Markdown textarea), SEO title and description (same limits as products),
sort order, and the attribute assignment: a checkbox per existing attribute
(label, unit, type) with a sort order input. On edit, a hint says that a slug
change changes the URLs of the category and all its products.

Saving calls `public.admin_save_category(payload jsonb)` (`security invoker`),
which inserts or updates the category and replaces its `category_attribute`
rows in one transaction. A taken slug is a field error. Unassigning an
attribute keeps existing article values; the article dialog still shows
attributes an article has a value for (6a D8).

Delete is offered only for categories without products; the FK
(`on delete restrict`, `23503`) is the guard and maps to "Die Kategorie
enthält noch Produkte."

### D8 — Colours and materials

`/admin/farben` lists colours (swatch, name, RAL reference, hex code, family,
number of products). Create and edit in a dialog: name, RAL reference
(optional), hex code (`#RRGGBB`, text input with a live swatch), family (text
input with a `datalist` of existing families). Delete only when unused;
`23503` maps to "Die Farbe ist noch Produkten zugeordnet."

`/admin/materialien` lists materials (code, name, number of products and
articles). Dialog: code and name. A taken code is a field error. Delete only
when unused; `23503` maps to "Das Material wird noch verwendet."

Both are single-table writes with the session client; no SQL function needed.

### D9 — Accessories

The product edit page gets a section "Zubehör": rows of article number (text
input), the resolved article and product name, and up/down buttons.
"Zubehör speichern" sends the set:

1. The action resolves the article numbers (trimmed, exact match) to ids;
   unknown numbers become field errors on their row.
2. `public.admin_set_product_accessories(p_product_id, payload jsonb)`
   (`security invoker`), payload `[{article_id, sort_order}]`, replaces all
   rows in one transaction and raises `22023` for an article of the product
   itself ("Artikel des eigenen Produkts sind kein Zubehör.") or a duplicate
   ("Jeder Artikel darf nur einmal Zubehör sein.").

Accessories of unpublished products stay hidden publicly through the existing
RLS policy.

### D10 — Alt-text review hint

The import set every alt text to the product name. `listProducts` also reads
the product's media alt texts; a product needs review when any alt text equals
its name (trimmed, case-insensitive). The list shows a badge "Alt-Text prüfen"
and gets a filter `?alt=pruefen`. Computed in TypeScript; the list has ≈ 130
rows.

### D11 — Shared rules from 6a

- Every write goes through `adminWrite` (session check, revalidation of the
  whole site after success only, logging of `db_error` with context and PG
  code only).
- Shared Zod schemas with German messages per area (`lib/admin/*-schema.ts`);
  form and action use the same schema.
- New SQL function messages are added to `KNOWN_DB_MESSAGES`; new FK messages
  are passed to `fromPg` per call.
- All new functions are `security invoker`, `execute` for `authenticated`
  only (revoked from `public`/`anon`); RLS stays the boundary.
- Admin forms use native `<select>`/inputs as in 6a; dialogs need JavaScript.

## Requirements and success criteria

| ID    | Requirement                          | Success criterion                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Upload validation per D2.            | **SC-1** (unit): the validator accepts JPEG, PNG and WebP fixtures and returns their dimensions; rejects an empty file, a file > 5 MiB, a GIF, a text file renamed to `.jpg`, an image wider than 8000 px and an empty alt text, each with a German message.                                                                                                                                                                                   |
| FR-2  | Upload flow per D2.                  | **SC-2** (unit, fake storage and DB): success uploads to `products/{id}/{uuid}.{ext}` with `upsert: false` and then attaches; a failed attach removes the uploaded file; a failed upload attaches nothing; (e2e): uploading a PNG shows it in the section and on the public page of a published product.                                                                                                                                       |
| FR-3  | `admin_attach_media` per D2.         | **SC-3** (pgTAP): the first image becomes `thumbnail`, the next `gallery` with a higher `sort_order`; `anon` cannot execute it; a non-admin `authenticated` call changes nothing.                                                                                                                                                                                                                                                              |
| FR-4  | `admin_set_product_media` per D4.    | **SC-4** (pgTAP): moving the thumbnail to another image succeeds; a missing or foreign media id, zero or two thumbnails and an empty alt text raise and keep the old rows; (unit): `alt_origin` follows the origin rule for all four transitions.                                                                                                                                                                                              |
| FR-5  | Image section per D4.                | **SC-5** (unit): up/down changes the order, the radio marks one thumbnail, the size pre-check shows the message without submitting; (e2e): changing alt text and order and saving shows the new order and alt text on the public page.                                                                                                                                                                                                         |
| FR-6  | Image and product cleanup per D5.    | **SC-6** (pgTAP): `admin_remove_media` returns the path and promotes the next gallery image when the thumbnail is removed; `admin_delete_product` deletes product and its media rows and returns their paths; refuses a published product; (unit, fakes): remove image and delete product remove the returned files, and a failed file removal is logged without failing the action; (e2e): removing an image removes it from the public page. |
| FR-7  | `pnpm media:prune` per D6.           | **SC-7** (unit, fakes): finds unlinked rows and unreferenced files older than one hour, skips younger files and `certificates/`, deletes nothing without `--apply`, exits ≠ 0 on a storage error; (int): against the local stack an orphan row and file are removed with `--apply`.                                                                                                                                                            |
| FR-8  | Alt-text hint per D10.               | **SC-8** (unit): the review rule matches an alt text equal to the name ignoring case and surrounding spaces and nothing else; (int): `?alt=pruefen` lists only products that need review.                                                                                                                                                                                                                                                      |
| FR-9  | Accessories per D9.                  | **SC-9** (pgTAP): the set replaces all rows; an own article or a duplicate raises and keeps the old rows; (unit): an unknown article number is a field error on its row; (e2e): adding an accessory shows it under "Passendes Zubehör" on the public page.                                                                                                                                                                                     |
| FR-10 | Categories per D7.                   | **SC-10** (pgTAP): `admin_save_category` inserts and updates the category and replaces its attributes; a taken slug raises `23505`; deleting a category with products raises `23503`; (unit): schema messages, slug conflict and FK mapping; (e2e): a new category with an attribute appears as an option in the product form and the attribute shows in the article dialog of a product in it.                                                |
| FR-11 | Colours and materials per D8.        | **SC-11** (unit): schemas reject an invalid hex code, empty name and empty material code; a taken material code is a field error; FK violations map to the D8 messages; (e2e): renaming a colour shows the new name on a public product page; deleting a used material is refused with the message.                                                                                                                                            |
| FR-12 | Navigation and pages.                | **SC-12** (unit): the header renders all four nav entries; (e2e): every new admin page carries the demo banner, the robots meta tag and `X-Robots-Tag`, redirects without a session, and axe reports no serious or critical violations on the category form, the colour dialog and the image section.                                                                                                                                          |
| FR-13 | Shared rules per D11.                | **SC-13** (unit): every new action revalidates after success and never after failure; `db_error` yields the generic form error and logs context and PG code only; (pgTAP): every new function is not executable by `anon`.                                                                                                                                                                                                                     |
| FR-14 | Docs updated.                        | **SC-14** (review): `docs/data-model.md` lists the new functions, the media lifecycle and the delete rules for master data; `docs/deploy.md` documents `pnpm media:prune` and the upload size limit behind the reverse proxy; roadmap shows 6b done.                                                                                                                                                                                           |
| FR-15 | Preview works (needs the developer). | **SC-15** (ops): after deploy an image upload of ≈ 4 MB works on the preview domain and `pnpm media:prune` (dry run) runs against production; evidence in the Gate 2 report or deferred together with the 6a admin account.                                                                                                                                                                                                                    |

## Structure

```
next.config.ts                                     serverActions.bodySizeLimit (D2)
app/admin/(protected)/produkte/[id]/page.tsx       + image and accessory sections
app/admin/(protected)/produkte/media-actions.ts    upload, save set, remove (D2, D4, D5)
app/admin/(protected)/produkte/accessory-actions.ts
app/admin/(protected)/kategorien/{page,neu/page,[id]/page,actions}.tsx|ts
app/admin/(protected)/farben/{page,actions}.tsx|ts
app/admin/(protected)/materialien/{page,actions}.tsx|ts
components/admin/{image-section,upload-form,accessory-section,category-form,color-dialog,material-dialog}.tsx
lib/admin/{media,media-schema,image-check,accessories,categories,category-schema,colors-master,materials,master-schema,alt-review}.ts
scripts/media/prune.mts                            media:prune (D6)
supabase/migrations/…_admin_media_master_data.sql  admin_attach_media, admin_set_product_media,
                                                   admin_remove_media, admin_delete_product,
                                                   admin_set_product_accessories,
                                                   admin_save_category
supabase/tests/12_admin_media.test.sql             SC-3, SC-4, SC-6, SC-9, SC-10, SC-13
e2e/admin-media.spec.ts, e2e/admin-master-data.spec.ts
```

File names are a guide; the plan may merge small modules.

## Data flow

Upload: form → Server Action → `adminWrite` → validate bytes → Storage upload
(session) → `admin_attach_media` → on failure remove file → on success
`revalidatePath('/', 'layout')` → toast.

Other writes: form → Server Action → `adminWrite` → Zod → `lib/admin/*` with
the session client → Postgres (RLS, functions) → Storage removals where D5
applies → revalidation → `useActionState` → toast.

## New dependencies

None. `image-size` moves from `devDependencies` to `dependencies` (D2).

## Error handling

| Case                                 | Behaviour                                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| No session / no admin role           | As in 6a (redirect, 403 page, `forbidden`)                       |
| Invalid file or alt text             | Field error, nothing uploaded                                    |
| Storage upload fails                 | Generic form error, log context and storage error, nothing saved |
| Attach fails after upload            | Form error, uploaded file removed (compensation)                 |
| Stale image list, thumbnail rule     | Form error with the function's message, nothing written          |
| File removal fails after a DB delete | Action succeeds, log; `media:prune` cleans up later              |
| Taken slug or material code          | Field error                                                      |
| Master data still in use (`23503`)   | Form error with the D7/D8 message, nothing deleted               |
| Unknown accessory article number     | Field error on the row                                           |
| Other DB error                       | Generic form error, log with context and PG code                 |

## Prerequisites from the developer

- Production admin account (open from 6a, SC-16) for SC-15; can be deferred.
- If the reverse proxy on the VPS limits request bodies below 6 MB, raise it
  (checked during SC-15).

## Risks

- **Body size limits outside Next.js:** the reverse proxy in front of the app
  may cap uploads; SC-15 checks it on the preview.
- **Memory:** a 5 MiB upload is held in memory once in the proxy buffer and
  once in the action; acceptable for one admin.
- **Pixel bombs:** the 8000 px limit caps what `next/image` has to decode on
  the shared VPS.
- **Orphans after partial failures:** compensation and logging cover the
  normal paths; `media:prune` covers the rest.
- **Next.js 16 conventions** (`bodySizeLimit` under `experimental`, File in
  FormData): the implementation reads the bundled docs first.

## Deviations

- The accessory article-number lookup runs read-only before the write; only the
  save goes through `adminWrite` (D9).
- Colour and material delete buttons are always shown. The foreign key guard
  (`23503`) refuses deleting anything still in use, with the D8 message (D8
  says "delete only when unused").
- `admin_set_product_media` and `admin_set_product_accessories` take the order
  from the array position; the payload has no `sort_order` field (D4, D9).
- `admin_remove_media` deletes the `media` row even if another product were
  linked to it, because D1 makes images single-product; the rule is documented
  in `docs/data-model.md`.
- Form validation in `lib/admin/media-schema.ts` is hand-written like
  `color-schema.ts`, not Zod (D11).
- Shared server helpers live in `lib/admin/server.ts` (`runWrite` with optional
  conflict messages, `idFrom`, `editIdFrom`, `CATALOG_BUCKET`, `fileLog`); the
  upload, remove and delete-with-files flows live in `lib/admin/media-flow.ts`.
  Colour and material modules are `lib/admin/colors.ts` and
  `lib/admin/master-data.ts`.
- `DeleteRecordButton` closes its dialog on a "saved" action state as well as
  on redirect (colour and material deletes return a state, the category delete
  redirects).
- `pnpm media:prune` reads `media` rows in pages of 1000 (PostgREST caps
  responses), keeps files with a missing or invalid creation date, and exits 1
  when linked rows exist but the `products/` listing is empty.
- The upload action (`app/admin/(protected)/produkte/media-actions.ts`)
  validates the file and metadata before the admin check; D2 step 1 puts
  `checkAdmin` first. No write happens before the check.

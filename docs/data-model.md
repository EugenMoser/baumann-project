# Data model

Binding data model for the catalog. It maps the customer's established product
system into Postgres (Supabase) and fixes the structural problems of the legacy
site (v1). Numbers in this document come from the legacy exports: 126 product
groups, 283 article rows, 66 colours, 229 product–colour links.

## Non-negotiable

The customer's numbering system stays exactly as it is.

- Article numbers (`6010`, `6211/80`) are never reassigned or reformatted.
  They are strings — some contain a slash.
- The order number "article number + colour suffix" (`6174 - 1`) stays the
  number customers and sales staff use.
- The assignment of articles to product groups stays as maintained in-house.

Everything below changes only how this reality is stored and displayed.

## Concepts

| Concept         | Meaning                                                   | Example                   |
| --------------- | --------------------------------------------------------- | ------------------------- |
| Category        | Product area, own page with intro text                    | Möbelbereich              |
| Product (group) | One public page; groups articles that differ by dimension | Schließkeile mit Dämpfung |
| Article         | Version of a product with its own in-house number         | 6010 = height 8 mm        |
| Colour          | Second variant axis, identified by a per-product suffix   | `6010 - 1` = brown        |
| Variant         | Orderable unit = article × product colour                 | `6010 - 1`                |

Two independent variant axes: **dimension** (own article number) and
**colour** (suffix). Every article of a product is available in every colour of
that product — there are no exceptions in the customer's range.

## Tables

### `category`

| Column                         | Type               | Notes                             |
| ------------------------------ | ------------------ | --------------------------------- |
| `id`                           | bigint identity PK |                                   |
| `slug`                         | text, unique       | URL segment (`moebel`)            |
| `name`                         | text               |                                   |
| `intro_text`                   | text (Markdown)    | Visible text on the category page |
| `seo_title`, `seo_description` | text, nullable     | Override; generated otherwise     |
| `sort_order`                   | int                |                                   |

### `attribute` and `category_attribute`

Typed article properties replace free text such as `"Höhe 8 mm"`.

| `attribute` column | Type                     | Notes                                                                                                                             |
| ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | bigint identity PK       |                                                                                                                                   |
| `key`              | text, unique             | Domain-specific: `height`, `pipe_diameter`, `pin_diameter`, `hose_diameter`, `bore_diameter`, `strip_width`, `insertion_depth`, … |
| `label`            | text                     | `Höhe`, `für Rohr Ø`                                                                                                              |
| `unit`             | text, nullable           | `mm`                                                                                                                              |
| `data_type`        | enum `decimal` \| `text` |                                                                                                                                   |
| `sort_order`       | int                      |                                                                                                                                   |

`category_attribute (category_id, attribute_id, sort_order)` defines which
attributes a category uses. It drives the admin form and later the filters.

Keys are domain-specific on purpose: in the legacy data "Ø" alone carries at
least eight meanings (pipe, insulated pipe, hose, pin, bore, cable, rod, round
tube). A generic `diameter` would make filters meaningless.

### `material`

| Column | Type               | Notes                                |
| ------ | ------------------ | ------------------------------------ |
| `id`   | bigint identity PK |                                      |
| `code` | text, unique       | `PA-6`, `PP`, `ABS`, `POM`, `TPE`, … |
| `name` | text               |                                      |

Qualifiers such as "temperature-resistant up to 100 °C", "glass-fibre
reinforced" or "suitable for drinking water (KTW)" go into `material_note` on the
product or article. Filterable material properties come with the filter feature.

### `product`

| Column                             | Type                                      | Notes                             |
| ---------------------------------- | ----------------------------------------- | --------------------------------- |
| `id`                               | bigint identity PK                        |                                   |
| `category_id`                      | FK → category                             |                                   |
| `slug`                             | text, unique per category                 | `schliesskeile-mit-daempfung`     |
| `name`                             | text                                      | H1                                |
| `subtitle`                         | text, nullable                            | "für Push-Lock-Schlösser"         |
| `description`                      | text (Markdown), nullable                 |                                   |
| `material_id`                      | FK → material, nullable                   | Default for all articles          |
| `material_note`                    | text, nullable                            |                                   |
| `status`                           | enum `draft` \| `published` \| `archived` | Public reads see `published` only |
| `sort_order`                       | int                                       |                                   |
| `seo_title`, `seo_description`     | text, nullable                            |                                   |
| `description_origin`, `seo_origin` | enum `human` \| `ai` \| `ai_edited`       | Drives the AI label in the UI     |
| `legacy_product_id`                | int, nullable, unique                     | Import and future 301 redirects   |
| `created_at`, `updated_at`         | timestamptz                               |                                   |

### `article`

| Column           | Type                      | Notes                                                             |
| ---------------- | ------------------------- | ----------------------------------------------------------------- |
| `id`             | bigint identity PK        |                                                                   |
| `product_id`     | FK → product              | Home product                                                      |
| `article_number` | text, unique              | Unchanged from the in-house system                                |
| `name`           | text, nullable            | Differs from the product name in 192 of 283 rows                  |
| `description`    | text (Markdown), nullable | Mounting notes and other full sentences                           |
| `note`           | text, nullable            | Leftovers that cannot be typed, e.g. "mit hochgesetzter Dämpfung" |
| `material_id`    | FK → material, nullable   | Overrides the product material                                    |
| `material_note`  | text, nullable            |                                                                   |
| `sort_order`     | int                       |                                                                   |

### `article_attribute`

`(article_id, attribute_id)` PK, `value_decimal numeric` or `value_text text`
depending on the attribute's `data_type` (enforced by a check/trigger).

### `article_packaging`

Alternative pack sizes the customer can choose from.

| Column       | Type           | Notes                    |
| ------------ | -------------- | ------------------------ |
| `article_id` | FK → article   |                          |
| `quantity`   | int            | Integer, not string      |
| `label`      | text, nullable | e.g. "Karton" once known |
| `sort_order` | int            |                          |

### `product_accessory`

`(product_id, article_id, sort_order)` — articles shown as matching
accessories on another product's page.

Needed because two articles (`2739`, `6461`) appear in two product groups in the
legacy data: once in their home product and once as accessories of
"Bedienschlüssel". A unique article number with a single home product plus this
relation covers both.

### `color` and `product_color`

| `color` column  | Type               | Notes                                  |
| --------------- | ------------------ | -------------------------------------- |
| `id`            | bigint identity PK |                                        |
| `name`          | text               | `weiß`                                 |
| `ral_reference` | text, nullable     | `ähnlich RAL 9016`                     |
| `hex_code`      | text               |                                        |
| `family`        | text               | `weiß`, `grau`, `rot`, … for filtering |

| `product_color` column   | Type           | Notes                                                                                              |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| `product_id`, `color_id` | PK             |                                                                                                    |
| `suffix`                 | text, nullable | Display only; the same colour has different suffixes in different products (13 of 27 used colours) |
| `is_default`             | bool           | Partial unique index: at most one default per product                                              |
| `sort_order`             | int            |                                                                                                    |

Never derive the default colour from `suffix = 0` — 27 of 126 products have no
suffix 0.

### View `variant`

Article × product colour with the derived order number — the single place where
the order number is built:

```
order_number = article_number || coalesce(' - ' || suffix, '')
```

Products without colours yield one row with the bare article number.

Search, the inquiry form and structured data all read from this view.

### `media` and `product_media`

| `media` column    | Type                                | Notes                                           |
| ----------------- | ----------------------------------- | ----------------------------------------------- |
| `id`              | bigint identity PK                  |                                                 |
| `storage_path`    | text                                | Path in Supabase Storage; never in the repo     |
| `width`, `height` | int                                 | Avoids layout shift without file access         |
| `alt_text`        | text                                | Maintained per image, not built from a template |
| `alt_origin`      | enum `human` \| `ai` \| `ai_edited` |                                                 |

`product_media (product_id, media_id, role, sort_order)`, `role ∈ {thumbnail, gallery}`.

### `ai_generation`

Audit log for the AI assistant: `entity`, `entity_id`, `field`, `model`,
`prompt_version`, `output`, `created_at`, `accepted_at`. Feeds the AI label and
the cost counter.

### Search

Postgres full-text search (`german` configuration) over product name, subtitle,
description and article names, plus a `pg_trgm` index on article and order
numbers. No keyword table — meta keywords are ignored by search engines and the
legacy exports contain none.

## Access rules (RLS)

- RLS is enabled on every table.
- Anonymous users read published catalog data only; `status <> 'published'`
  rows and `ai_generation` are invisible.
- Writes are restricted to the admin role. Admin = JWT
  `app_metadata.role = 'admin'`, checked by `private.is_admin()`.
- Children of a product are visible when the product is visible to the caller.
- Storage: bucket `catalog`, files served by public URL, listing and writes for
  the admin only. Files of draft products are reachable by URL if the path is
  known (accepted trade-off).
- The service-role key is used server-side only (import, removal scripts).

## Pages and visible content

One page per product group:

```
/produkte/{category.slug}
/produkte/{category.slug}/{product.slug}
```

The legacy pages were judged too thin by search engines (~65 visible words,
~20 page-specific). Therefore the product page shows, visibly in the HTML:

- all article numbers of the group,
- typed attributes per article and the material,
- colour variants with full order numbers,
- matching accessories and related products of the same category.

Content that matters must not live only inside a widget that renders options
into a portal, and must never be hidden via `display:none` or off-screen tricks
(cloaking). `<details>` is fine. Missing data reduces the display; it never
removes a whole block.

## Structured data

`ProductGroup` with `hasVariant` (one `Product` per variant, `sku` = order
number), `variesBy` height/colour where applicable. Every SKU in the markup is
visible on the page. No invented prices — the business works by inquiry.

## Import rules

Source: legacy CSV exports kept outside the repo.

1. Create the 5 categories; intro texts are written editorially.
2. Products: generate slugs from names, set `legacy_product_id`, map
   `description1` → `subtitle`, `description2..4` → `description`.
3. Articles: `article_number` unchanged. The first article occurrence defines the
   home product; further occurrences become `product_accessory` rows.
4. Parse article descriptions into attributes using known patterns
   ("Höhe 8 mm", "für Rohr Ø 15 mm"). Full sentences go to `article.description`,
   remaining fragments to `note`. **Never guess** — report every unparsed value.
5. `vpe1..4` → `article_packaging` as integers.
6. Materials: split the legacy free text into `material` + `material_note`.
7. Colours: import used colours only; merge exact duplicates (same name and
   hex); derive `family` from the legacy colour-id prefix; set `is_default`
   explicitly.
8. Images → Supabase Storage with normalised file names (no spaces), read
   dimensions, take over alt texts for editorial review. The legacy data has no
   alt texts, so the product name is the initial alt text and every image is
   listed in the import report for review.
9. Cross-check: every legacy article number exists exactly once; every product
   has at least one article and exactly one default colour when it has colours.

The importer is idempotent and aborts — non-zero exit — on connection errors,
empty results or failed cross-checks. A run that writes nothing must never look
like success.

## Removal

A removal script deletes all catalog rows and Storage objects of the customer and
resets branding to placeholders. The revocation procedure (≤ 14 days) is
documented in [`docs/revocation.md`](revocation.md).

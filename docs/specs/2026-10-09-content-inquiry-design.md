# Feature 5 — Content pages & inquiry

- **Status:** implemented (2026-10-09)
- **Roadmap:** feature 5 ([roadmap](../roadmap.md))
- **Estimate:** 9 h (roadmap: 6 h; the certificate import and the order-number
  check add about 3 h)
- **Builds on:** feature 2 (RLS, grants, `variant` view, Storage bucket
  `catalog`), feature 3 (importer modules, `remove_catalog()`), feature 4
  (site shell, product page, `connection()` pattern, E2E stack)

## Goal

Complete the public site around the catalog: a quality page with the quality
and environmental policy and the ISO certificates, links to imprint and
privacy policy, and an inquiry form that behaves like a real one — prefilled
with an order number, validated on the server, checked against the catalog —
but sends nothing and says so clearly.

## Scope

In scope:

- Quality page `/qualitaet`: policy text and certificates (preview image,
  PDF downloads per language)
- Tables `certificate` and `certificate_document`, filled by a separate CLI
  `pnpm certificates:import`; files in the Storage bucket `catalog` under
  `certificates/`
- `remove_catalog()` also deletes certificates
- Imprint and privacy as footer links to the developer's pages
- Inquiry page `/anfrage` with form, shared Zod schema, Server Action,
  `NoopInquirySender`, visible demo notice, link to the official site
- Entry points: header navigation, footer, product page (call to action and
  every order number in "Alle Bestellnummern")
- `noindex`, demo banner and accessibility checks extended to the new pages
- Docs: `docs/data-model.md`, `docs/import.md`, `docs/revocation.md`, roadmap

Out of scope:

- Sending or storing inquiries, e-mail delivery, captcha, rate limit (nothing
  is sent or stored, see D7)
- Several items per inquiry (roadmap "Later": inquiry list)
- An about page — the official site has none; the home page intro stays
- Own imprint and privacy pages (D1)
- Editing certificates in the admin (re-run the CLI instead)
- English pages

## Decisions

### D1 — Imprint and privacy are links to the developer's pages

The developer operates the preview domain, so the developer's imprint and
privacy policy apply. `config/branding.ts` gets `developer.imprintUrl` and
`developer.privacyUrl` (same values in the customer and the placeholder
branding). The footer shows "Impressum" and "Datenschutz" on every page; the
inquiry form's consent text links to `privacyUrl`. No legal text lives in the
repo.

Prerequisite outside the repo: the developer's privacy policy covers this
preview (hosting on the VPS, self-hosted Supabase, no cookies or tracking,
inquiry form validates and discards input, server logs).

### D2 — Policy text in the branding, certificates in the database

The policy text (about 100 words of customer content) is a new branding field
`qualityPolicy: string[]` (paragraphs). The placeholder branding gets a
neutral text, so the existing one-line revocation switch also removes it.

Certificates are data: they come from the customer, change rarely and must
disappear with `catalog:remove`. They live in two tables:

`certificate`

| Column           | Type               | Notes                             |
| ---------------- | ------------------ | --------------------------------- |
| `id`             | bigint identity PK |                                   |
| `standard`       | text, unique       | e.g. `ISO 9001`                   |
| `title`          | text               | e.g. `Qualitätsmanagement`        |
| `preview_path`   | text               | Storage path of the preview image |
| `preview_width`  | int > 0            |                                   |
| `preview_height` | int > 0            |                                   |
| `preview_alt`    | text, not empty    |                                   |
| `sort_order`     | int                |                                   |

`certificate_document`

| Column           | Type                         | Notes                       |
| ---------------- | ---------------------------- | --------------------------- |
| `certificate_id` | FK → `certificate`, cascade  | PK together with `language` |
| `language`       | text, check `in ('de','en')` |                             |
| `storage_path`   | text                         | Storage path of the PDF     |

RLS enabled on both; `anon` and `authenticated` may select every row
(certificates have no draft state); writes only for the admin
(`private.is_admin()`), with explicit grants (see the pitfall in
`CLAUDE.md`). Files are served by public URL from `catalog/certificates/…`;
`next.config.ts` already allows `catalog/**` for `next/image`.

### D3 — Separate certificate CLI

`pnpm certificates:import --dir <dir> [--dry-run]` reads a hand-written
manifest `certificates.json` and the files next to it. The directory lives
outside the repo, like the catalog snapshot.

```json
[
  {
    "standard": "ISO 9001",
    "title": "Qualitätsmanagement",
    "preview": { "file": "<preview>.png", "alt": "<alt text>" },
    "documents": [
      { "language": "de", "file": "<file>.pdf" },
      { "language": "en", "file": "<file>.pdf" }
    ]
  }
]
```

Flow:

1. Validate the manifest with Zod (non-empty list, unique `standard`, one
   document per language, at least one document per certificate).
2. Check every file: exists, PDFs start with `%PDF-`, previews are PNG, JPEG
   or WebP; read the preview dimensions with the existing image helpers.
3. `--dry-run` stops here and prints what would be written.
4. Upload to `certificates/<normalised file name>` (upsert).
5. Call `public.import_certificates(payload jsonb)` (`security definer`,
   execute only for `service_role`): replaces all certificate rows in one
   transaction and aborts on an empty payload.
6. Delete objects under `certificates/` that no row references.

Exit codes and env handling follow `catalog:import` (`IMPORT_SUPABASE_URL`,
`IMPORT_SUPABASE_SECRET_KEY`; non-zero on any failure; a run that writes
nothing never looks like success). The importer modules (`env`, `result`,
storage helpers) are reused.

Extending `catalog:import` was rejected: its snapshot is a one-to-one export
of the legacy database with exactly four files; hand-collected PDFs would
break that contract and tie two unrelated update cycles together.

`remove_catalog()` additionally deletes `certificate` rows (documents
cascade) and reports `certificates: n`; the bucket is emptied as before.

### D4 — Quality page rendered per request

`/qualitaet` reads the certificates and calls `connection()` like the home
page (feature 4 D2: no database access during the build). Layout: H1, policy
paragraphs, then one card per certificate with preview image (`next/image`,
dimensions from the row), standard, title and one download link per
document ("PDF, Deutsch" / "PDF, Englisch"). No certificates → the section is
omitted, the policy text stays. Database error → logged, `app/error.tsx`.

### D5 — Inquiry page and prefill

`/anfrage` is rendered per request. `?bestellnummer=` (trimmed, at most 40
characters, otherwise ignored) prefills the order-number field. The page looks
the number up via `findVariant(orderNumber)` in `lib/catalog/` (anon client,
function `public.find_variant(q)` over the `variant` view, whitespace
collapsed like the search) and shows the product
name with a link to the product page next to the field. An unknown number
stays in the field and shows a hint; it is never a 404.

Above the form a visible notice: "Vorschau: Anfragen über dieses Formular
werden geprüft, aber nicht versendet." with a link to the official website for
real inquiries (`branding.officialSiteUrl`; the official site has no separate
contact page).

### D6 — Shared schema, Server Action, `NoopInquirySender`

`lib/inquiry/schema.ts` (no server-only imports) defines the form schema:

| Field         | Rule                                                   |
| ------------- | ------------------------------------------------------ |
| `orderNumber` | optional, trimmed, ≤ 40; if set it must exist (server) |
| `quantity`    | optional integer 1–1 000 000                           |
| `name`        | required, 2–100                                        |
| `company`     | optional, ≤ 100                                        |
| `email`       | required, valid e-mail, ≤ 254                          |
| `phone`       | optional, ≤ 40, digits, spaces, `+ - / ( )`            |
| `message`     | optional, ≤ 2000                                       |
| `privacy`     | required checkbox                                      |

Plus: `orderNumber` or `message` must be set. Error messages are German.

`app/anfrage/actions.ts` exports `submitInquiry(prevState, formData)`:

1. Parse with the schema → on failure return field errors and the submitted
   values (so the page re-renders filled in without JavaScript).
2. If `orderNumber` is set, `findVariant` → unknown number is a field error;
   database error is a form error ("Prüfung derzeit nicht möglich").
3. `inquirySender.send(inquiry)`; the only implementation is
   `NoopInquirySender`, which does nothing and returns `ok`.
4. Return `{ status: "discarded", orderNumber, productName, quantity }`.

The form is a client component with `useActionState`; it posts to the Server
Action and works without JavaScript (progressive enhancement). With
JavaScript it validates with the same schema before submitting. The submit
button reads "Anfrage prüfen (wird nicht versendet)". After a
successful submit the form is replaced by a result panel: "Ihre Anfrage ist
gültig, wurde aber nicht versendet – dies ist eine Vorschau." with the order
number, product and quantity and the link to the official website.

Form values are never logged; logs contain only error kinds.

### D7 — No rate limit, no captcha

Nothing is sent or stored, so spam has no effect beyond one indexed lookup
per submit. Server Actions check the request origin (CSRF). The AI endpoints
of feature 7 get their own rate limit; it is not shared with this form.

### D8 — Entry points

- Header navigation: "Produkte", "Qualität", "Anfrage".
- Footer: "Qualität", "Impressum", "Datenschutz" next to the existing links.
- Product page: the call to action "Anfrage über die offizielle Website"
  becomes "Anfrage stellen" → `/anfrage?bestellnummer=<order number of the
first article in the default colour>`; every entry in "Alle
  Bestellnummern" links to `/anfrage?bestellnummer=<number>`.

Header and footer still read only `branding` (feature 4 D12).

## Requirements and success criteria

SC types as in feature 4: **unit**, **pgTAP**, **int**, **e2e**, **review**,
**ops**. Tests use the synthetic seed; the seed gets one certificate with a
German and an English document (paths under `certificates/`, no real files).

| ID    | Requirement                                                                                | Success criterion                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Footer links "Impressum" and "Datenschutz" to the developer's URLs from the branding (D1). | **SC-1** (unit): footer renders both links with `branding.developer.imprintUrl` / `privacyUrl`; the branding schema rejects missing or non-http URLs.                                                                                                                                                                                                                                                                                                            |
| FR-2  | Tables, constraints, RLS and grants for certificates (D2).                                 | **SC-2** (pgTAP): tables exist with the listed constraints; `anon` reads all rows and cannot insert, update or delete; an admin JWT can write; the existing RLS test covers the new tables.                                                                                                                                                                                                                                                                      |
| FR-3  | `import_certificates(payload)` replaces all certificates in one transaction (D3).          | **SC-3** (pgTAP): a second call with a different payload leaves exactly the new rows; an empty payload raises and keeps the old rows; `anon` and `authenticated` cannot execute it.                                                                                                                                                                                                                                                                              |
| FR-4  | CLI `certificates:import` per D3.                                                          | **SC-4** (unit): manifest validation (duplicate standard, duplicate language, no documents, missing file, non-PDF file, unsupported preview type) fails with a clear message and exit ≠ 0; `--dry-run` writes nothing; (int): a run against the local stack uploads the files, writes the rows and deletes an orphan object under `certificates/`.                                                                                                               |
| FR-5  | `remove_catalog()` removes certificates (D3).                                              | **SC-5** (pgTAP): after `remove_catalog()` both certificate tables are empty and the result contains the `certificates` count; (review): `docs/revocation.md` lists `certificates: 0` in the verify step.                                                                                                                                                                                                                                                        |
| FR-6  | Quality page `/qualitaet` per D4.                                                          | **SC-6** (unit): the certificate card renders preview with width/height and alt text and one link per document with its language; (e2e): `/qualitaet` shows the policy text, the seeded certificate and links to both PDF URLs under `catalog/certificates/`.                                                                                                                                                                                                    |
| FR-7  | Policy text in the branding; the placeholder branding contains no customer text (D2).      | **SC-7** (unit): both brandings parse; `placeholderBranding` contains neither the customer name nor the customer's policy text.                                                                                                                                                                                                                                                                                                                                  |
| FR-8  | Inquiry page with prefill and demo notice (D5).                                            | **SC-8** (pgTAP): `find_variant(q)` matches an order number regardless of whitespace and returns the canonical number; (unit): query-parameter parsing; (int): `findVariant` returns product name and slugs for a seeded order number and `not_found` for an unknown one or a draft product; (e2e): `/anfrage?bestellnummer=<seeded>` shows the number, the product link and the demo notice with a link to the official site; an unknown number shows the hint. |
| FR-9  | Shared schema per D6.                                                                      | **SC-9** (unit): valid input passes; each rule in the table fails with its German message; neither order number nor message fails.                                                                                                                                                                                                                                                                                                                               |
| FR-10 | Server Action per D6.                                                                      | **SC-10** (unit, with fake lookup and sender): invalid input returns field errors and the submitted values and does not call the sender; an unknown order number is a field error; a lookup error is a form error; valid input calls the sender once and returns `discarded`.                                                                                                                                                                                    |
| FR-11 | Form works with and without JavaScript; result panel per D6.                               | **SC-11** (e2e): with JavaScript a valid submit shows the result panel with order number and the "nicht versendet" notice; an invalid e-mail shows the field error; with JavaScript disabled the same valid submit shows the result panel.                                                                                                                                                                                                                       |
| FR-12 | No form values in logs (D6).                                                               | **SC-12** (unit): on a lookup error the logger receives the error kind but none of the submitted values.                                                                                                                                                                                                                                                                                                                                                         |
| FR-13 | Entry points per D8.                                                                       | **SC-13** (unit): header renders links to `/qualitaet` and `/anfrage`; the order-number list links each number to `/anfrage?bestellnummer=…` (URL-encoded); (e2e): the product page call to action opens `/anfrage` prefilled with the default order number.                                                                                                                                                                                                     |
| FR-14 | `noindex`, demo banner and accessibility on the new pages.                                 | **SC-14** (e2e): `/qualitaet` and `/anfrage` carry the robots meta tag and `X-Robots-Tag` and show the demo banner; the axe scan reports no serious or critical violations on both, including the form with visible errors.                                                                                                                                                                                                                                      |
| FR-15 | Runbooks and data model updated.                                                           | **SC-15** (review): `docs/data-model.md` describes both tables; `docs/import.md` documents the manifest and the CLI with placeholders only; `docs/revocation.md` covers certificates.                                                                                                                                                                                                                                                                            |
| FR-16 | Production run (needs the developer's certificate files).                                  | **SC-16** (ops): after deploy `pnpm certificates:import` runs against production and `/qualitaet` shows both certificates with working PDF links; evidence in the Gate 2 report or deferred like feature 3 SC-15.                                                                                                                                                                                                                                                |

## Structure

```
app/qualitaet/page.tsx                    quality page (D4)
app/anfrage/page.tsx                      inquiry page (D5)
app/anfrage/actions.ts                    submitInquiry Server Action (D6)
components/inquiry/inquiry-form.tsx       client form with useActionState
components/inquiry/inquiry-result.tsx     result panel
components/quality/certificate-card.tsx
components/site/site-header.tsx           + Qualität, Anfrage
components/site/site-footer.tsx           + Qualität, Impressum, Datenschutz
components/catalog/order-number-list.tsx  numbers become links
config/branding.ts                        + imprintUrl, privacyUrl, qualityPolicy
lib/inquiry/schema.ts                     shared Zod schema
lib/inquiry/sender.ts                     InquirySender, NoopInquirySender
lib/catalog/certificates.ts               loadCertificates() → Result
lib/catalog/variant-lookup.ts             findVariant(orderNumber) → Result
scripts/certificates/cli.mts              certificates:import
scripts/certificates/manifest.mts         manifest schema and file checks
supabase/migrations/<ts>_certificates.sql tables, RLS, grants, functions
supabase/tests/09_certificates.test.sql
e2e/content.spec.ts, e2e/inquiry.spec.ts  (+ noindex, a11y specs)
```

## Data flow

```
/qualitaet ─▶ loadCertificates (anon) ─▶ certificate(+_document)
             images/PDFs: browser ─▶ Storage public URL (catalog/certificates/…)

/anfrage?bestellnummer=X ─▶ findVariant (anon) ─▶ variant view
form submit ─▶ submitInquiry (Server Action)
              ─▶ schema.safeParse ─▶ findVariant ─▶ NoopInquirySender ─▶ "discarded"

certificates:import --dir D ─▶ manifest + file checks ─▶ Storage upload
              ─▶ import_certificates(payload) (service role) ─▶ orphan cleanup
```

## New dependencies

None. Zod, supabase-js, the image helpers and the test stack exist.

## Error handling

- Read functions return `Result`; pages map `db_error` to the error boundary
  after logging, as in feature 4.
- The quality page without certificates still renders the policy text.
- The inquiry page never fails because of a bad query parameter; invalid or
  unknown numbers become hints.
- The Server Action never throws for user input; it returns field or form
  errors. Only unexpected exceptions reach the error boundary.
- The CLI exits non-zero on invalid manifests, missing files, upload errors
  and database errors; uploads before a failed database call are removed by
  the next successful run's orphan cleanup.

## Prerequisites from the developer

- Certificate files (preview images and PDFs per language) and the manifest,
  downloaded from the official site into a directory outside the repo
- The privacy policy on the developer's site covers the preview (D1)
- Production run of `certificates:import` for SC-16 (can be deferred)

## Risks

- **Legal texts are links only.** If the developer's privacy policy does not
  mention the preview, the preview lacks a privacy policy. Mitigation:
  prerequisite above, named in the Gate 2 report.
- **Visitors send real inquiries.** Mitigation: notice above the form, button
  label and result panel all say the inquiry is not sent; link to the official
  website in each.
- **`useActionState` and progressive enhancement in Next.js 16.** The plan
  checks the bundled docs (`node_modules/next/dist/docs/`) and SC-11 tests the
  form without JavaScript.

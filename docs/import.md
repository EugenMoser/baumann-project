# Catalog import runbook

How to load the legacy catalog into the database with `pnpm catalog:import`.
Design: `docs/specs/2026-10-09-import-removal-design.md`. Removal on
revocation: `docs/revocation.md`. Placeholders in angle brackets are never
committed with real values.

## 1. Overview

The importer reads a local snapshot (four JSON files exported from the legacy
database), validates and maps it, downloads the product images from the legacy
image CDN, uploads them to the Storage bucket `catalog` and then calls the
database function `public.import_catalog` once.

The function writes everything in one transaction: reference data and products
are upserted by natural key, children are rewritten, products that are no
longer in the snapshot are deleted, and cross-checks run before the commit. If
anything fails, nothing is written. Images are uploaded before the function
runs; after a successful run, unreferenced objects under `products/` are
deleted.

Every run that gets as far as mapping writes a Markdown report to
`<snapshot>/import-report.md` (overwritten per run). It lists counts and every
value the importer could not map and kept verbatim, plus every image whose alt
text needs review. The report is not a failure; invalid or empty data is.

```
usage: pnpm catalog:import --snapshot <dir> [--dry-run] [--overwrite-admin-edits]
```

Production was loaded once; since then the catalog is edited in the admin
area. Production is the source of truth and is not re-imported: a re-import
would overwrite admin edits (section 6). The importer therefore refuses a real run against any target
whose host is not exactly `127.0.0.1` or `localhost`, unless
`--overwrite-admin-edits` is given (section 5). Dry runs and runs against the
local stack are not affected. The guard checks only the hostname of
`IMPORT_SUPABASE_URL`: it is a seatbelt against mistakes, not a security
boundary (a tunnel from a local port to a production API, for example, passes
it).

## 2. Snapshot export

Prerequisite: the MongoDB Database Tools (`mongoexport`). On macOS:
`brew install mongodb-database-tools`.

Keep the connection string in a shell variable, never in a file inside the
repo. Write the snapshot outside the repo:

```bash
read -rs LEGACY_MONGO_URI && export LEGACY_MONGO_URI
SNAPSHOT=~/catalog-snapshot-$(date +%F)   # outside the repo
mkdir -p "$SNAPSHOT"
for c in products articles colors product_colors_connection; do
  mongoexport --uri "$LEGACY_MONGO_URI" --collection "$c" --jsonArray --out "$SNAPSHOT/$c.json"
done
unset LEGACY_MONGO_URI
```

The directory must contain exactly these four files: `products.json`,
`articles.json`, `colors.json`, `product_colors_connection.json`. Never commit
snapshots or reports.

## 3. Environment

| Variable                     | Meaning                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `IMPORT_SUPABASE_URL`        | API URL of the target Supabase (local stack or production API host)     |
| `IMPORT_SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) or legacy `service_role` JWT of the target   |
| `IMPORT_IMAGE_BASE_URL`      | Base URL that relative image paths in the snapshot are resolved against |

For the local run you can put the three variables into `.env.import` in the
repo root. It is ignored by the `.env*` rule in `.gitignore` and loaded by the
pnpm scripts (`node --env-file-if-exists=.env.import`). Variables already set
in the shell take precedence.

Do not store the production secret key in a file. Enter it per shell session:

```bash
read -rs IMPORT_SUPABASE_SECRET_KEY && export IMPORT_SUPABASE_SECRET_KEY
export IMPORT_SUPABASE_URL=https://<api host>
export IMPORT_IMAGE_BASE_URL=https://<image cdn base>
```

The scripts never print key values.

## 4. Local run

```bash
pnpm db:start
pnpm exec supabase status          # API URL and secret key of the local stack
export IMPORT_SUPABASE_URL=http://localhost:54321
read -rs IMPORT_SUPABASE_SECRET_KEY && export IMPORT_SUPABASE_SECRET_KEY
export IMPORT_IMAGE_BASE_URL=https://<image cdn base>

pnpm catalog:import --snapshot "$SNAPSHOT" --dry-run
```

The dry run reads, validates and maps the snapshot and writes the report, but
downloads and writes nothing. Read `$SNAPSHOT/import-report.md`, then run the
real import without `--dry-run`:

```bash
pnpm catalog:import --snapshot "$SNAPSHOT"
```

On success the command prints the keys returned by the database function: the
payload totals plus the `deleted_*` counts and `deleted_objects` (orphaned
Storage objects removed). To undo a local import, run
`pnpm catalog:remove --confirm 127.0.0.1:54321` first so local Storage files
are removed too, then `pnpm db:reset` to restore the seed.

## 5. Production run

Production was loaded once from the legacy data. Do not import into it again:
edits made in the admin since then would be overwritten. A real
run against a non-local target stops with exit code `1` before reading the
snapshot and writes nothing:

```
Refusing: the target is not the local stack. Production holds admin edits that a re-import would overwrite. …
```

Only if overwriting the admin edits is intended (for example, rebuilding the
catalog from the legacy data on purpose), take a fresh backup first
(`docs/deploy.md` section 10) and pass `--overwrite-admin-edits`:

1. Set the production environment as in section 3 (secret key via `read -rs`).
2. Dry run, then read the report:
   `pnpm catalog:import --snapshot "$SNAPSHOT" --dry-run`
3. Real run:
   `pnpm catalog:import --snapshot "$SNAPSHOT" --overwrite-admin-edits`
4. Check the result:
   - `curl -s https://<app host>/api/health` returns `"db":"ok"`.
   - One product is readable with the publishable key:
     `curl -s "https://<api host>/rest/v1/product?select=id,name&limit=1" -H "apikey: <publishable key>"`
5. Clear the secret from the shell: `unset IMPORT_SUPABASE_SECRET_KEY`.

## 6. Re-import semantics

The import is idempotent: the same snapshot gives the same database state and
the same row ids.

On an update the importer **overwrites** the fields it owns: names, texts,
material, sort order, attributes, colours, packaging and media links. It
**keeps** the fields it does not own: `product.status`, `seo_*`, `*_origin`,
`media.alt_text` (set on insert only). Category `intro_text` and `seo_*` are
filled only while empty (see "Category texts"). New products are inserted as
`published`. Products and articles that carry a legacy id but are missing from
the snapshot are deleted; rows without a legacy id (seed data, later admin
entries) are never touched.

Since the admin area is live, a re-import overwrites admin edits of imported
fields. Production is therefore not re-imported; the guard in section 5
enforces this.

A re-import replaces the images of imported products, including admin uploads
to them: `import_catalog` deletes their `product_media` links and every
unlinked `media` row under `products/`. Afterwards the importer removes the
objects under `products/` that are neither in the snapshot nor referenced by
any `media` row. It reads all `media.storage_path` values from the database for
this, so admin uploads to products created in the admin
(`products/{product_id}/{uuid}.{ext}`) are kept. If the paths cannot be read,
nothing is deleted and the import exits with an error.

### Category texts

Category intro and SEO texts live in `scripts/import/categories.mts`. The
importer writes `intro_text`, `seo_title` and `seo_description` only where the
stored value is empty. To change an existing text before the admin area exists,
clear it in the database and re-run the import.

## 7. Exit codes and failures

Exit code `0`: success (a dry run counts as success). `1`: the run aborted.
`2`: wrong usage (missing `--snapshot`, unknown flag). A run that writes nothing
never exits `0` unless it is a dry run.

Aborts after mapping starts write the report with the reason in its outcome
line. Environment and snapshot failures happen before that and print to stderr
only. After an RPC failure the uploaded files may differ from the committed
media dimensions until the next successful run.

| Situation                                                                                                | Report | What to do                                                                                                                            |
| -------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid environment variables                                                                            | no     | Fix the variable named in the message (values are never printed).                                                                     |
| Real run against a non-local target without `--overwrite-admin-edits`                                    | no     | Intended: production is not re-imported (section 5). Nothing was written.                                                             |
| Snapshot missing, empty (including zero products or articles) or malformed (message names file and path) | no     | Re-export the snapshot (section 2).                                                                                                   |
| Invalid data during mapping (article references an unknown product, unknown category, …)                 | yes    | Read the message; fix or re-export the snapshot. Nothing was written.                                                                 |
| One or more image downloads failed                                                                       | yes    | The report lists each URL. Check `IMPORT_IMAGE_BASE_URL` and the CDN, then re-run. Nothing was written.                               |
| Image upload failed                                                                                      | yes    | Check the Storage service and key, then re-run. The database was not changed.                                                         |
| Database rejected the import (RPC error or failed cross-check)                                           | yes    | Read the message. The database was not changed. Uploaded images stay in the bucket; the next successful run reuses or cleans them up. |
| Imported, but orphan cleanup failed                                                                      | yes    | The data is committed. Re-run the import to finish the cleanup.                                                                       |

## 8. Certificates

The ISO certificates are not part of the snapshot. `pnpm certificates:import`
loads them from a separate directory outside the repository, with a
hand-written manifest `certificates.json` next to the files:

```json
[
  {
    "standard": "<standard, e.g. ISO 9001>",
    "title": "<title>",
    "preview": { "file": "<preview>.png", "alt": "<alt text>" },
    "documents": [
      { "language": "de", "file": "<file>.pdf" },
      { "language": "en", "file": "<file>.pdf" }
    ]
  }
]
```

File names must be plain names in that directory (no `/`, no `..`). `standard`
is unique, each language appears once per certificate, previews are PNG, JPEG or
WebP, documents are PDFs. Take the preview images and PDFs from the quality page
of the official website.

```bash
pnpm certificates:import --dir <dir> --dry-run
pnpm certificates:import --dir <dir>
```

The environment is the one from section 3 (`IMPORT_SUPABASE_URL`,
`IMPORT_SUPABASE_SECRET_KEY`); `IMPORT_IMAGE_BASE_URL` is not needed. The run
validates the manifest and files (a dry run stops here), uploads the files to
`certificates/` in the bucket `catalog`, replaces all certificate rows in one
transaction and removes unreferenced files under `certificates/`.

Exit code `0`: success (a dry run counts as success). `1`: manifest, upload or
database failure; rows are only written after all uploads succeeded, and if only
the orphan cleanup fails, re-run the command. `2`: wrong usage (missing
`--dir`, unknown flag, directory inside the repository). Delete the directory
when you no longer need it.

## 9. Afterwards

The snapshot and the report contain customer data. Delete the snapshot
directory (including `import-report.md`) as soon as you no longer need it:

```bash
rm -r "$SNAPSHOT"
```

Also remove `.env.import` if you created one, and unset the exported variables.

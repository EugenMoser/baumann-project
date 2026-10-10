# Content Pages & Inquiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quality page with certificates from Storage, imprint/privacy links, and an inquiry form that validates against the catalog and discards the inquiry with a visible demo notice.

**Architecture:** Certificates are two new tables filled by a separate CLI (`pnpm certificates:import`) that reuses the importer's env, Storage and Result modules; `remove_catalog()` clears them too. The quality page and the inquiry page render per request and read through `lib/catalog/*` (publishable key, RLS). The inquiry form is a client component with `useActionState`; a shared Zod schema validates in the browser and in the Server Action; the action looks the order number up via the SQL function `find_variant(q)` and hands the inquiry to `NoopInquirySender`.

**Tech Stack:** Next.js 16.3 App Router (Server Actions), React 19.2 (`useActionState`), TypeScript strict, Tailwind CSS 4, Supabase (Postgres 17, PostgREST, Storage), Zod 4, `image-size`, Vitest + Testing Library, pgTAP, Playwright + `@axe-core/playwright`, pnpm 10.

**Spec:** `docs/specs/2026-10-09-content-inquiry-design.md` — read it before every task; FR-/SC-IDs below refer to it.

## Global Constraints

- TypeScript `strict: true`; no `any` without a comment explaining why.
- Zod for every external input: query string `bestellnummer`, form data, manifest, RPC and table results.
- All UI copy is German; code, identifiers, comments and commit messages are English.
- Never remove the demo banner or `noindex` (meta robots, `X-Robots-Tag`, `robots.txt`); no page sets its own `robots` metadata.
- No customer data in tests, fixtures or seed; the seed uses synthetic values (`99xxx`, "(Beispiel)").
- Never commit certificate files, snapshots, DB dumps or images.
- Every new table: RLS enabled, explicit grants, admin-only insert/update/delete policies in its migration (the RLS pgTAP test fails otherwise).
- Every new function: `revoke execute … from public, anon, authenticated` first, then grant only what is needed.
- `pnpm db:types` after every migration; CI fails if `lib/supabase/database.types.ts` is stale.
- No database access during `next build`: new pages call `connection()` or read `searchParams`.
- Form values (name, e-mail, phone, company, message, order number, quantity) are never logged.
- Header and footer read only `branding`, never the database.
- No new dependencies.
- Next.js 16: read `node_modules/next/dist/docs/01-app/02-guides/forms.md` and `01-app/01-getting-started/07-mutating-data.md` before writing the Server Action and form.
- TDD: write the failing test first, see it fail, then implement.
- Commit after each task with Conventional Commits on branch `feat/content-inquiry` (WIP commits allowed). Never push, never merge.

## Review Focus

1. **Manifest file names with path segments** (`../secret.pdf`, `sub/x.pdf`, absolute paths): the CLI must refuse them instead of reading files outside the manifest directory. → unit test in Task 2.
2. **Form re-render after a server-side error with JavaScript** (unknown order number passes the client schema): every entered value must still be in the fields, not reset by React's automatic form reset. → e2e test in Task 8.
3. **Order numbers typed with different spacing or case** (`99010-1`, `99010 - 1`, `99211/80`): must be found and shown in canonical form; a draft or archived product's number must not be. → pgTAP in Task 5.
4. **Odd query parameters on `/anfrage`** (repeated `?bestellnummer=a&bestellnummer=b`, 500 characters, empty): the page renders without error and without a 500. → unit test in Task 5, e2e in Task 8.
5. **Database unreachable during a submit**: the form shows "Prüfung derzeit nicht möglich", keeps the values, and the log contains no submitted value. → unit test in Task 6.

---

### Task 1: Certificate tables, import/remove functions, seed

**Files:**

- Create: `supabase/migrations/20261011090000_certificates.sql`
- Modify: `supabase/seed.sql` (append certificate rows; extend the sequence loop)
- Create: `supabase/tests/09_certificates.test.sql`
- Modify: `supabase/tests/01_schema.test.sql` (`tables_are` list)
- Modify: `supabase/tests/06_import.test.sql` (removal empties certificate tables)
- Modify: `lib/supabase/database.types.ts` (generated)
- Modify: `docs/data-model.md` (new section)

**Interfaces:**

- Produces:
  - Tables `public.certificate (id, standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order)` and `public.certificate_document (certificate_id, language, storage_path)`
  - `public.import_certificates(payload jsonb) returns jsonb` — payload is a JSON array of `{ standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order, documents: [{ language, storage_path }] }`; returns `{ "certificates": n, "documents": m }`; execute for `service_role` only
  - `public.remove_catalog()` result gains key `certificates`
  - Seed: certificate id 1, standard `ISO 9001 (Beispiel)`, title `Qualitätsmanagement (Beispiel)`, preview `certificates/test-iso-9001.png` (600×848, alt `Beispielzertifikat ISO 9001`), documents `de` → `certificates/test-iso-9001-de.pdf`, `en` → `certificates/test-iso-9001-en.pdf`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/09_certificates.test.sql`:

```sql
begin;
select plan(17);

select has_table('public', 'certificate', 'certificate table exists');
select has_table('public', 'certificate_document', 'certificate_document table exists');
select col_is_unique('public', 'certificate', 'standard', 'standard is unique');
select col_is_pk('public', 'certificate_document', array['certificate_id', 'language'], 'one document per language');
select throws_ok(
  $$insert into public.certificate_document (certificate_id, language, storage_path) values (1, 'fr', 'certificates/x.pdf')$$,
  '23514', null, 'only de and en are allowed');
select throws_ok(
  $$insert into public.certificate (standard, title, preview_path, preview_width, preview_height, preview_alt) values ('X', 'X', 'products/x.png', 1, 1, 'x')$$,
  '23514', null, 'preview must live under certificates/');

-- Functions: service role only
select ok(not has_function_privilege('anon', 'public.import_certificates(jsonb)', 'execute'), 'anon cannot import certificates');
select ok(not has_function_privilege('authenticated', 'public.import_certificates(jsonb)', 'execute'), 'authenticated cannot import certificates');
select ok(has_function_privilege('service_role', 'public.import_certificates(jsonb)', 'execute'), 'service_role can import certificates');

-- anon reads, cannot write
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*) from public.certificate), 1::bigint, 'anon reads certificates');
select is((select count(*) from public.certificate_document), 2::bigint, 'anon reads certificate documents');
select throws_ok($$delete from public.certificate$$, '42501', null, 'anon cannot delete certificates');
reset role;

-- import replaces everything
set local role service_role;
select is(
  public.import_certificates($j$[
    {"standard": "ISO 14001 (Test)", "title": "Umwelt", "preview_path": "certificates/a.png",
     "preview_width": 10, "preview_height": 20, "preview_alt": "A", "sort_order": 0,
     "documents": [{"language": "de", "storage_path": "certificates/a-de.pdf"}]}
  ]$j$::jsonb),
  '{"certificates": 1, "documents": 1}'::jsonb, 'import returns counts');
select results_eq($$select standard from public.certificate$$, $$values ('ISO 14001 (Test)')$$,
  'import replaces the previous certificates');
select throws_ok($$select public.import_certificates('[]'::jsonb)$$, 'P0001', null, 'empty payload raises');
select throws_ok(
  $$select public.import_certificates('[{"standard": "X", "title": "X", "preview_path": "certificates/x.png", "preview_width": 1, "preview_height": 1, "preview_alt": "x", "sort_order": 0, "documents": []}]'::jsonb)$$,
  'P0001', null, 'a certificate without documents raises');

-- removal
select ok((public.remove_catalog() ? 'certificates'), 'remove_catalog reports certificates');
reset role;

select * from finish();
rollback;
```

Note: `plan(17)` must equal the number of assertions; count again after editing.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm db:start && pnpm db:reset && pnpm exec supabase test db`
Expected: FAIL in `09_certificates.test.sql` (`certificate` does not exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261011090000_certificates.sql`:

```sql
-- Certificates for the quality page (feature 5, spec D2/D3). Filled by
-- `pnpm certificates:import`, removed by remove_catalog(). Files live in the
-- public bucket `catalog` under certificates/.

create table public.certificate (
  id bigint generated always as identity primary key,
  standard text not null unique check (btrim(standard) <> ''),
  title text not null check (btrim(title) <> ''),
  preview_path text not null check (preview_path like 'certificates/%'),
  preview_width integer not null check (preview_width > 0),
  preview_height integer not null check (preview_height > 0),
  preview_alt text not null check (btrim(preview_alt) <> ''),
  sort_order integer not null default 0
);

create table public.certificate_document (
  certificate_id bigint not null references public.certificate (id) on delete cascade,
  language text not null check (language in ('de', 'en')),
  storage_path text not null check (storage_path like 'certificates/%'),
  primary key (certificate_id, language)
);

-- Grants (default privileges on public are revoked for anon/authenticated).
grant select on public.certificate, public.certificate_document to anon, authenticated;
grant insert, update, delete on public.certificate, public.certificate_document to authenticated;
grant usage on sequence public.certificate_id_seq to authenticated;

alter table public.certificate enable row level security;
alter table public.certificate_document enable row level security;

-- Certificates have no draft state: everyone reads every row.
create policy "public read" on public.certificate for select to anon, authenticated using (true);
create policy "public read" on public.certificate_document for select to anon, authenticated using (true);

create policy "admin insert" on public.certificate for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on public.certificate for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on public.certificate for delete to authenticated using ((select private.is_admin()));
create policy "admin insert" on public.certificate_document for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on public.certificate_document for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on public.certificate_document for delete to authenticated using ((select private.is_admin()));

-- Replaces all certificates in one transaction (spec D3). Runs as the caller
-- (service role, bypasses RLS), like import_catalog.
create function public.import_certificates(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cert jsonb;
  doc jsonb;
  new_id bigint;
  imported integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'import_certificates: payload must be a non-empty array';
  end if;
  delete from public.certificate where true;
  for cert in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(cert -> 'documents') <> 'array' or jsonb_array_length(cert -> 'documents') = 0 then
      raise exception 'import_certificates: certificate % has no documents', cert ->> 'standard';
    end if;
    insert into public.certificate (standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order)
    values (cert ->> 'standard', cert ->> 'title', cert ->> 'preview_path',
            (cert ->> 'preview_width')::integer, (cert ->> 'preview_height')::integer,
            cert ->> 'preview_alt', coalesce((cert ->> 'sort_order')::integer, 0))
    returning id into new_id;
    for doc in select value from jsonb_array_elements(cert -> 'documents') loop
      insert into public.certificate_document (certificate_id, language, storage_path)
      values (new_id, doc ->> 'language', doc ->> 'storage_path');
    end loop;
    imported := imported + 1;
  end loop;
  return jsonb_build_object(
    'certificates', imported,
    'documents', (select count(*) from public.certificate_document));
end;
$$;

revoke execute on function public.import_certificates(jsonb) from public, anon, authenticated;
grant execute on function public.import_certificates(jsonb) to service_role;

-- remove_catalog() from feature 3, extended by the certificate tables.
create or replace function public.remove_catalog()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  counts jsonb;
begin
  counts := jsonb_build_object(
    'products', (select count(*) from public.product),
    'articles', (select count(*) from public.article),
    'media', (select count(*) from public.media),
    'certificates', (select count(*) from public.certificate));
  -- `where true`: some setups reject DELETE without a WHERE clause.
  delete from public.product_accessory where true;
  delete from public.product_media where true;
  delete from public.product_color where true;
  delete from public.article_packaging where true;
  delete from public.article_attribute where true;
  delete from public.article where true;
  delete from public.product where true;
  delete from public.category_attribute where true;
  delete from public.category where true;
  delete from public.attribute where true;
  delete from public.material where true;
  delete from public.color where true;
  delete from public.media where true;
  delete from public.ai_generation where true;
  delete from public.certificate_document where true;
  delete from public.certificate where true;
  return counts;
end;
$$;

revoke execute on function public.remove_catalog() from public, anon, authenticated;
grant execute on function public.remove_catalog() to service_role;
```

Before relying on it, compare the copied `remove_catalog` body with the current one in `supabase/migrations/20261009090000_import_functions.sql` (lines 249–279); they must differ only by the certificate lines.

- [ ] **Step 4: Seed and existing tests**

Append to `supabase/seed.sql` **before** the final sequence `do $$ … $$;` block:

```sql
-- Synthetic certificate (no files in Storage; pages render links only).
insert into public.certificate (id, standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order) overriding system value values
  (1, 'ISO 9001 (Beispiel)', 'Qualitätsmanagement (Beispiel)', 'certificates/test-iso-9001.png', 600, 848, 'Beispielzertifikat ISO 9001', 0);

insert into public.certificate_document (certificate_id, language, storage_path) values
  (1, 'de', 'certificates/test-iso-9001-de.pdf'),
  (1, 'en', 'certificates/test-iso-9001-en.pdf');
```

and add `'certificate'` to the array in the sequence loop.

In `supabase/tests/01_schema.test.sql` add `'certificate', 'certificate_document'` to the `tables_are` array (plan count unchanged).

In `supabase/tests/06_import.test.sql` after the existing "every catalog table is empty after removal" assertion add:

```sql
select is(
  (select (select count(*) from public.certificate) + (select count(*) from public.certificate_document)),
  0::bigint, 'certificate tables are empty after removal');
```

and raise `select plan(28);` to `select plan(29);`.

- [ ] **Step 5: Run the database tests**

Run: `pnpm db:reset && pnpm exec supabase test db`
Expected: PASS for all files, including `04_rls.test.sql` (RLS, grants and admin policies cover the new tables).

- [ ] **Step 6: Regenerate types and document the model**

Run: `pnpm db:types`

In `docs/data-model.md` add after the `ai_generation` section a section `### certificate and certificate_document` with the two column tables from spec D2, one sentence that the CLI `pnpm certificates:import` fills them (link `import.md`), that `remove_catalog()` deletes them, and that files live under `certificates/` in the bucket `catalog`. In "Access rules (RLS)" add: "Certificates have no draft state; everyone reads them."

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm typecheck && pnpm exec prettier --check docs/data-model.md`
Expected: exit 0.

```bash
git add supabase/ lib/supabase/database.types.ts docs/data-model.md
git commit -m "feat(db): certificate tables with import and removal"
```

---

### Task 2: Certificate CLI

**Files:**

- Create: `scripts/certificates/manifest.mts`
- Create: `scripts/certificates/cli.mts`
- Modify: `scripts/import/images.mts` (`deleteOrphans` takes a prefix)
- Modify: `package.json` (script `certificates:import`)
- Create: `tests/certificates/manifest.test.ts`, `tests/certificates/cli.test.ts`
- Create: `tests/integration/certificates.test.ts`
- Modify: `tests/integration/import-helpers.ts` (`CATALOG_TABLES` + certificate tables)
- Modify: `docs/import.md` (new section), `docs/revocation.md` (verify step)

**Interfaces:**

- Consumes: `public.import_certificates(payload jsonb)` (Task 1); `parseRemoveEnv` from `scripts/import/env.mts`; `listObjects`, `StorageBucket` from `scripts/import/images.mts`; `slugify` from `scripts/import/map/text.mts`; `CliIo` type from `scripts/import/cli.mts`; `Result`, `ok`, `err` from `scripts/import/result.mts`.
- Produces:
  - `deleteOrphans(bucket: StorageBucket, keep: ReadonlySet<string>, prefix?: string): Promise<Result<number, string>>` (default prefix `"products"`, existing callers unchanged)
  - `manifest.mts`: `MANIFEST_FILE = "certificates.json"`; `type PreparedFile = { storagePath: string; bytes: Uint8Array; contentType: string }`; `type PreparedCertificate = { standard: string; title: string; sortOrder: number; preview: PreparedFile & { width: number; height: number; alt: string }; documents: (PreparedFile & { language: "de" | "en" })[] }`; `readCertificates(dir: string): Promise<Result<PreparedCertificate[], string>>`; `toPayload(certs: readonly PreparedCertificate[]): CertificatePayload[]`
  - `cli.mts`: `runCertificatesCli(argv: readonly string[], io: CliIo): Promise<number>` — exit 0 ok, 1 failure, 2 usage

- [ ] **Step 1: Write the failing unit tests**

Create `tests/certificates/manifest.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readCertificates,
  toPayload,
} from "../../scripts/certificates/manifest.mts";
import { makePng } from "../import/png";

const PDF = Buffer.from("%PDF-1.4\n% synthetic test file\n");

type Entry = {
  standard: string;
  title: string;
  preview: { file: string; alt: string };
  documents: { language: string; file: string }[];
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  standard: "ISO 9001",
  title: "Qualitätsmanagement",
  preview: { file: "Vorschau ISO 9001.png", alt: "Zertifikat ISO 9001" },
  documents: [
    { language: "de", file: "Zertifikat DE.pdf" },
    { language: "en", file: "Zertifikat EN.pdf" },
  ],
  ...over,
});

async function fixture(
  manifest: unknown,
  files: Record<string, Buffer> = {
    "Vorschau ISO 9001.png": makePng(60, 80),
    "Zertifikat DE.pdf": PDF,
    "Zertifikat EN.pdf": PDF,
  }
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  await writeFile(join(dir, "certificates.json"), JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(dir, name), bytes);
  return dir;
}

describe("readCertificates (FR-4, SC-4)", () => {
  it("prepares a valid manifest with normalised storage paths and dimensions", async () => {
    const result = await readCertificates(await fixture([entry()]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [cert] = result.value;
    expect(cert?.preview).toMatchObject({
      storagePath: "certificates/vorschau-iso-9001.png",
      contentType: "image/png",
      width: 60,
      height: 80,
      alt: "Zertifikat ISO 9001",
    });
    expect(cert?.documents.map((d) => [d.language, d.storagePath])).toEqual([
      ["de", "certificates/zertifikat-de.pdf"],
      ["en", "certificates/zertifikat-en.pdf"],
    ]);
    expect(toPayload(result.value)).toEqual([
      {
        standard: "ISO 9001",
        title: "Qualitätsmanagement",
        preview_path: "certificates/vorschau-iso-9001.png",
        preview_width: 60,
        preview_height: 80,
        preview_alt: "Zertifikat ISO 9001",
        sort_order: 0,
        documents: [
          { language: "de", storage_path: "certificates/zertifikat-de.pdf" },
          { language: "en", storage_path: "certificates/zertifikat-en.pdf" },
        ],
      },
    ]);
  });

  it.each([
    ["a missing manifest", null, /certificates\.json/],
    ["an empty list", [], /at least one/i],
    [
      "a duplicate standard",
      [entry(), entry()],
      /duplicate standard "ISO 9001"/,
    ],
    [
      "a duplicate language",
      [
        entry({
          documents: [
            { language: "de", file: "Zertifikat DE.pdf" },
            { language: "de", file: "Zertifikat EN.pdf" },
          ],
        }),
      ],
      /duplicate language "de"/,
    ],
    ["no documents", [entry({ documents: [] })], /documents/],
    [
      "an unknown language",
      [entry({ documents: [{ language: "fr", file: "Zertifikat DE.pdf" }] })],
      /language/,
    ],
    [
      "a missing file",
      [entry({ documents: [{ language: "de", file: "fehlt.pdf" }] })],
      /fehlt\.pdf/,
    ],
    [
      "a path segment (Review Focus 1)",
      [
        entry({
          documents: [{ language: "de", file: "../Zertifikat DE.pdf" }],
        }),
      ],
      /file name/,
    ],
    [
      "an absolute path (Review Focus 1)",
      [entry({ documents: [{ language: "de", file: "/etc/passwd" }] })],
      /file name/,
    ],
    [
      "a document that is not a PDF",
      [
        entry({
          documents: [{ language: "de", file: "Vorschau ISO 9001.png" }],
        }),
      ],
      /not a PDF/,
    ],
    [
      "an unsupported preview",
      [entry({ preview: { file: "Zertifikat DE.pdf", alt: "x" } })],
      /unsupported preview/,
    ],
  ])("rejects %s", async (_label, manifest, message) => {
    const dir =
      manifest === null
        ? await mkdtemp(join(tmpdir(), "certificates-"))
        : await fixture(manifest);
    const result = await readCertificates(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it("rejects two files that normalise to the same storage path", async () => {
    const dir = await fixture(
      [
        entry({
          documents: [
            { language: "de", file: "Zertifikat DE.pdf" },
            { language: "en", file: "zertifikat-de.pdf" },
          ],
        }),
      ],
      {
        "Vorschau ISO 9001.png": makePng(60, 80),
        "Zertifikat DE.pdf": PDF,
        "zertifikat-de.pdf": PDF,
      }
    );
    const result = await readCertificates(dir);
    expect(!result.ok && result.error).toMatch(/same storage path/);
  });
});
```

Create `tests/certificates/cli.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCertificatesCli } from "../../scripts/certificates/cli.mts";
import { makePng } from "../import/png";

function io(env: Record<string, string | undefined> = {}) {
  const lines: string[] = [];
  return {
    env,
    lines,
    log: (l: string) => lines.push(l),
    error: (l: string) => lines.push(l),
  };
}

async function validDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  await writeFile(
    join(dir, "certificates.json"),
    JSON.stringify([
      {
        standard: "ISO 9001",
        title: "Qualitätsmanagement",
        preview: { file: "p.png", alt: "Vorschau" },
        documents: [{ language: "de", file: "d.pdf" }],
      },
    ])
  );
  await writeFile(join(dir, "p.png"), makePng(10, 10));
  await writeFile(join(dir, "d.pdf"), Buffer.from("%PDF-1.4\n"));
  return dir;
}

describe("certificates:import CLI (FR-4, SC-4)", () => {
  it("prints usage and exits 2 without --dir", async () => {
    const out = io();
    expect(await runCertificatesCli([], out)).toBe(2);
    expect(out.lines.join("\n")).toMatch(/usage/);
  });

  it("refuses a directory inside the repository", async () => {
    expect(await runCertificatesCli(["--dir", "docs"], io())).toBe(2);
  });

  it("exits 1 on an invalid manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "certificates-"));
    await writeFile(join(dir, "certificates.json"), "[]");
    expect(await runCertificatesCli(["--dir", dir], io())).toBe(1);
  });

  it("dry run validates and writes nothing (no env, no network)", async () => {
    const out = io();
    expect(
      await runCertificatesCli(["--dir", await validDir(), "--dry-run"], out)
    ).toBe(0);
    expect(out.lines.join("\n")).toMatch(
      /Dry run: 1 certificate\(s\), 1 document\(s\)/
    );
  });

  it("exits 1 without environment when not a dry run", async () => {
    expect(await runCertificatesCli(["--dir", await validDir()], io())).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/certificates`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `manifest.mts`**

Create `scripts/certificates/manifest.mts`:

```ts
// Reads and checks a hand-written certificate manifest (spec D3).
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { imageSize } from "image-size";
import { z } from "zod";
import { slugify } from "../import/map/text.mts";
import { err, ok, type Result } from "../import/result.mts";

export const MANIFEST_FILE = "certificates.json";

const fileName = z
  .string()
  .min(1)
  .refine(
    (name) => basename(name) === name && name !== "." && name !== "..",
    "must be a plain file name in the manifest directory"
  );

const manifestSchema = z
  .array(
    z.object({
      standard: z.string().trim().min(1),
      title: z.string().trim().min(1),
      preview: z.object({ file: fileName, alt: z.string().trim().min(1) }),
      documents: z
        .array(z.object({ language: z.enum(["de", "en"]), file: fileName }))
        .min(1, "needs at least one document"),
    })
  )
  .min(1, "needs at least one certificate")
  .superRefine((certs, ctx) => {
    const standards = new Set<string>();
    certs.forEach((cert, i) => {
      if (standards.has(cert.standard))
        ctx.addIssue({
          code: "custom",
          path: [i, "standard"],
          message: `duplicate standard "${cert.standard}"`,
        });
      standards.add(cert.standard);
      const languages = new Set<string>();
      for (const doc of cert.documents) {
        if (languages.has(doc.language))
          ctx.addIssue({
            code: "custom",
            path: [i, "documents"],
            message: `duplicate language "${doc.language}"`,
          });
        languages.add(doc.language);
      }
    });
  });

export type PreparedFile = {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
};
export type PreparedCertificate = {
  standard: string;
  title: string;
  sortOrder: number;
  preview: PreparedFile & { width: number; height: number; alt: string };
  documents: (PreparedFile & { language: "de" | "en" })[];
};
export type CertificatePayload = {
  standard: string;
  title: string;
  preview_path: string;
  preview_width: number;
  preview_height: number;
  preview_alt: string;
  sort_order: number;
  documents: { language: "de" | "en"; storage_path: string }[];
};

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((byte, i) => bytes[i] === byte);

function previewType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  )
    return "image/webp";
  return null;
}

const isPdf = (bytes: Uint8Array) =>
  startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

function storagePath(file: string): string {
  const dot = file.lastIndexOf(".");
  const base = slugify(dot > 0 ? file.slice(0, dot) : file);
  const extension = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
  return `certificates/${base || "file"}${extension ? `.${extension}` : ""}`;
}

async function readBytes(
  dir: string,
  file: string
): Promise<Result<Uint8Array, string>> {
  try {
    return ok(new Uint8Array(await readFile(join(dir, file))));
  } catch {
    return err(`file "${file}" cannot be read`);
  }
}

export async function readCertificates(
  dir: string
): Promise<Result<PreparedCertificate[], string>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8"));
  } catch (error: unknown) {
    return err(
      `${MANIFEST_FILE} cannot be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success)
    return err(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`)
        .join("; ")
    );

  const certificates: PreparedCertificate[] = [];
  const used = new Map<string, string>();
  const claim = (path: string, file: string): Result<string, string> => {
    const other = used.get(path);
    if (other !== undefined && other !== file)
      return err(
        `"${file}" and "${other}" map to the same storage path ${path}`
      );
    used.set(path, file);
    return ok(path);
  };

  for (const [index, cert] of parsed.data.entries()) {
    const previewBytes = await readBytes(dir, cert.preview.file);
    if (!previewBytes.ok) return previewBytes;
    const contentType = previewType(previewBytes.value);
    if (contentType === null)
      return err(
        `unsupported preview "${cert.preview.file}" (PNG, JPEG or WebP)`
      );
    const { width, height } = imageSize(previewBytes.value);
    const previewPath = claim(
      storagePath(cert.preview.file),
      cert.preview.file
    );
    if (!previewPath.ok) return previewPath;

    const documents: PreparedCertificate["documents"] = [];
    for (const doc of cert.documents) {
      const bytes = await readBytes(dir, doc.file);
      if (!bytes.ok) return bytes;
      if (!isPdf(bytes.value)) return err(`"${doc.file}" is not a PDF`);
      const path = claim(storagePath(doc.file), doc.file);
      if (!path.ok) return path;
      documents.push({
        language: doc.language,
        storagePath: path.value,
        bytes: bytes.value,
        contentType: "application/pdf",
      });
    }

    certificates.push({
      standard: cert.standard,
      title: cert.title,
      sortOrder: index,
      preview: {
        storagePath: previewPath.value,
        bytes: previewBytes.value,
        contentType,
        width,
        height,
        alt: cert.preview.alt,
      },
      documents,
    });
  }
  return ok(certificates);
}

export function toPayload(
  certs: readonly PreparedCertificate[]
): CertificatePayload[] {
  return certs.map((c) => ({
    standard: c.standard,
    title: c.title,
    preview_path: c.preview.storagePath,
    preview_width: c.preview.width,
    preview_height: c.preview.height,
    preview_alt: c.preview.alt,
    sort_order: c.sortOrder,
    documents: c.documents.map((d) => ({
      language: d.language,
      storage_path: d.storagePath,
    })),
  }));
}
```

Check `slugify` in `scripts/import/map/text.mts` handles umlauts and spaces the way the test expects (`"Vorschau ISO 9001"` → `vorschau-iso-9001`); if not, adjust the test's expected paths to the actual `slugify` output rather than writing a second slug function.

- [ ] **Step 4: Generalise `deleteOrphans`**

In `scripts/import/images.mts` change the signature and the listing:

```ts
export async function deleteOrphans(
  bucket: StorageBucket,
  keep: ReadonlySet<string>,
  prefix = "products"
): Promise<Result<number, string>> {
  const listed = await listObjects(bucket, prefix);
```

Run: `pnpm exec vitest run tests/import` — Expected: PASS (existing callers use the default).

- [ ] **Step 5: Implement `cli.mts`**

Create `scripts/certificates/cli.mts`:

```ts
// Imports the ISO certificates from a local directory with a manifest.
// Usage: pnpm certificates:import --dir <dir> [--dry-run]
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "../import/cli.mts";
import { parseRemoveEnv } from "../import/env.mts";
import { deleteOrphans } from "../import/images.mts";
import { readCertificates, toPayload } from "./manifest.mts";

const USAGE = "usage: pnpm certificates:import --dir <dir> [--dry-run]";

export async function runCertificatesCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let dir: string | undefined;
  let dryRun = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { dir: { type: "string" }, "dry-run": { type: "boolean" } },
      strict: true,
    });
    dir = values.dir;
    dryRun = values["dry-run"] ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (dir === undefined) {
    io.error(USAGE);
    return 2;
  }
  const fromCwd = relative(process.cwd(), resolve(dir));
  if (fromCwd === "" || (!fromCwd.startsWith("..") && !isAbsolute(fromCwd))) {
    io.error(
      "The certificate directory must live outside the repository (customer data)."
    );
    return 2;
  }

  const certificates = await readCertificates(dir);
  if (!certificates.ok) {
    io.error(`Manifest rejected: ${certificates.error}`);
    return 1;
  }
  const documents = certificates.value.reduce(
    (n, c) => n + c.documents.length,
    0
  );
  if (dryRun) {
    io.log(
      `Dry run: ${certificates.value.length} certificate(s), ${documents} document(s) — nothing written.`
    );
    return 0;
  }

  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const supabase = createClient<Database>(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const bucket = supabase.storage.from("catalog");

  const files = certificates.value.flatMap((c) => [c.preview, ...c.documents]);
  for (const file of files) {
    const { error } = await bucket.upload(file.storagePath, file.bytes, {
      upsert: true,
      contentType: file.contentType,
    });
    if (error) {
      io.error(
        `Upload of ${file.storagePath} failed: ${error.message} — no rows were written.`
      );
      return 1;
    }
  }

  const payload = toPayload(certificates.value) as unknown as Json; // plain JSON data built above
  const { data, error } = await supabase.rpc("import_certificates", {
    payload,
  });
  if (error) {
    io.error(
      `Database rejected the certificates: ${error.message} — no rows were written.`
    );
    return 1;
  }
  io.log(`Imported: ${JSON.stringify(data)}`);

  const removed = await deleteOrphans(
    bucket,
    new Set(files.map((f) => f.storagePath)),
    "certificates"
  );
  if (!removed.ok) {
    io.error(
      `Rows written, but cleaning up old files failed: ${removed.error}. Re-run to finish.`
    );
    return 1;
  }
  io.log(`Removed ${removed.value} unreferenced file(s) under certificates/.`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runCertificatesCli(process.argv.slice(2), {
      env: process.env,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    });
    process.exit(code);
  } catch (error: unknown) {
    console.error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
```

If `Json` is not exported from `database.types.ts`, check how `scripts/import/cli.mts` passes its payload to `rpc("import_catalog")` and do the same.

In `package.json` add next to `catalog:remove`:

```json
"certificates:import": "node --env-file-if-exists=.env.import scripts/certificates/cli.mts",
```

- [ ] **Step 6: Run the unit tests**

Run: `pnpm exec vitest run tests/certificates tests/import`
Expected: PASS.

- [ ] **Step 7: Write the integration test**

In `tests/integration/import-helpers.ts` append `"certificate", "certificate_document"` to `CATALOG_TABLES`.

Create `tests/integration/certificates.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runCertificatesCli } from "../../scripts/certificates/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import { makePng } from "../import/png";
import { resetDatabase, serviceClient, silentIo } from "./import-helpers";

const client = serviceClient();
const env = () => ({
  IMPORT_SUPABASE_URL: process.env.IMPORT_SUPABASE_URL,
  IMPORT_SUPABASE_SECRET_KEY: process.env.IMPORT_SUPABASE_SECRET_KEY,
});

async function dirWith(standards: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  const manifest = standards.map((standard, i) => ({
    standard,
    title: `Titel ${i}`,
    preview: { file: `vorschau-${i}.png`, alt: `Vorschau ${i}` },
    documents: [
      { language: "de", file: `zert-${i}-de.pdf` },
      { language: "en", file: `zert-${i}-en.pdf` },
    ],
  }));
  await writeFile(join(dir, "certificates.json"), JSON.stringify(manifest));
  for (let i = 0; i < standards.length; i += 1) {
    await writeFile(join(dir, `vorschau-${i}.png`), makePng(30, 40));
    await writeFile(join(dir, `zert-${i}-de.pdf`), Buffer.from("%PDF-1.4\n"));
    await writeFile(join(dir, `zert-${i}-en.pdf`), Buffer.from("%PDF-1.4\n"));
  }
  return dir;
}

afterAll(async () => {
  await client.storage
    .from("catalog")
    .remove(
      (await listObjects(client.storage.from("catalog"), "certificates")).ok
        ? (
            (await listObjects(
              client.storage.from("catalog"),
              "certificates"
            )) as { ok: true; value: string[] }
          ).value
        : []
    );
  await resetDatabase();
});

describe("certificates:import against the local stack (FR-4, SC-4)", () => {
  it("uploads files, writes rows and removes orphans", async () => {
    await client.storage
      .from("catalog")
      .upload("certificates/verwaist.pdf", Buffer.from("%PDF-1.4\n"), {
        upsert: true,
        contentType: "application/pdf",
      });

    expect(
      await runCertificatesCli(
        ["--dir", await dirWith(["ISO 9001 (T)", "ISO 14001 (T)"])],
        silentIo(env())
      )
    ).toBe(0);

    const { data: rows } = await client
      .from("certificate")
      .select("standard, certificate_document(language)")
      .order("sort_order");
    expect(rows?.map((r) => r.standard)).toEqual([
      "ISO 9001 (T)",
      "ISO 14001 (T)",
    ]);
    expect(rows?.[0]?.certificate_document).toHaveLength(2);

    const objects = await listObjects(
      client.storage.from("catalog"),
      "certificates"
    );
    expect(objects.ok && objects.value.sort()).toEqual([
      "certificates/vorschau-0.png",
      "certificates/vorschau-1.png",
      "certificates/zert-0-de.pdf",
      "certificates/zert-0-en.pdf",
      "certificates/zert-1-de.pdf",
      "certificates/zert-1-en.pdf",
    ]);
  });

  it("a second run replaces the certificates", async () => {
    expect(
      await runCertificatesCli(
        ["--dir", await dirWith(["ISO 50001 (T)"])],
        silentIo(env())
      )
    ).toBe(0);
    const { data } = await client.from("certificate").select("standard");
    expect(data?.map((r) => r.standard)).toEqual(["ISO 50001 (T)"]);
  });
});
```

Simplify the `afterAll` cleanup into a small helper if it reads awkwardly; keep the behaviour (remove every object under `certificates/`, then reset the database).

- [ ] **Step 8: Run the integration tests**

Run: `pnpm db:reset && pnpm db:test`
Expected: PASS, including the existing `remove.test.ts` (now also asserting the certificate tables are empty after removal).

- [ ] **Step 9: Runbooks**

In `docs/import.md` add a section `## 6. Certificates` (renumber if needed) describing:

- the directory outside the repo with `certificates.json` and the files (example manifest from spec D3 with `<placeholders>`),
- where the files come from (download preview images and PDFs from the official website's quality page),
- `pnpm certificates:import --dir <dir> --dry-run`, then without `--dry-run`, same environment as `catalog:import` (`IMPORT_SUPABASE_URL`, `IMPORT_SUPABASE_SECRET_KEY`; `IMPORT_IMAGE_BASE_URL` not needed),
- what it does (upload under `certificates/`, replace all rows, remove unreferenced files) and the exit codes 0/1/2.

In `docs/revocation.md` step 3 extend the list of zero counts to `products: 0`, `articles: 0`, `media: 0` and `certificates: 0`; in step 5 add the local certificate directory to the local copies to delete.

- [ ] **Step 10: Checks and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0.

```bash
git add scripts/ tests/ package.json docs/import.md docs/revocation.md
git commit -m "feat(import): certificates:import CLI"
```

---

### Task 3: Branding, header and footer

**Files:**

- Modify: `config/branding.ts`, `config/branding.test.ts`
- Modify: `components/site/site-footer.tsx`, `components/site/site-footer.test.tsx`
- Modify: `components/site/site-header.tsx`, `components/site/site-header.test.tsx`

**Interfaces:**

- Produces: `Branding` gains `developer.imprintUrl: string`, `developer.privacyUrl: string`, `qualityPolicy: string[]` (at least one non-empty paragraph).

- [ ] **Step 1: Write the failing tests**

In `config/branding.test.ts` extend `valid`:

```ts
const valid = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  qualityPolicy: ["Ein Absatz."],
  developer: {
    name: "Dev Person",
    url: "https://dev.example",
    imprintUrl: "https://dev.example/impressum",
    privacyUrl: "https://dev.example/datenschutz",
  },
};
```

Update the existing "rejects an invalid developer URL" case to spread `valid.developer`. Add:

```ts
it.each(["imprintUrl", "privacyUrl"] as const)(
  "rejects a missing or non-http %s (FR-1, SC-1)",
  (key) => {
    const { [key]: _omitted, ...rest } = valid.developer;
    expect(
      brandingSchema.safeParse({ ...valid, developer: rest }).success
    ).toBe(false);
    expect(
      brandingSchema.safeParse({
        ...valid,
        developer: { ...valid.developer, [key]: "ftp://dev.example/x" },
      }).success
    ).toBe(false);
  }
);

it("rejects an empty quality policy (FR-7, SC-7)", () => {
  expect(
    brandingSchema.safeParse({ ...valid, qualityPolicy: [] }).success
  ).toBe(false);
  expect(
    brandingSchema.safeParse({ ...valid, qualityPolicy: [""] }).success
  ).toBe(false);
});
```

In the `placeholderBranding` describe, add the policy to the customer strings that must not appear:

```ts
    for (const value of [
      branding.companyName,
      branding.shortName,
      branding.officialSiteUrl,
      ...branding.qualityPolicy,
    ]) {
```

(If ESLint flags `_omitted`, use `Object.fromEntries(Object.entries(valid.developer).filter(([k]) => k !== key))`.)

In `components/site/site-footer.test.tsx` add:

```ts
  it("links imprint, privacy and the quality page (FR-1, SC-1)", () => {
    render(<SiteFooter branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: "Impressum" })).toHaveAttribute("href", placeholderBranding.developer.imprintUrl);
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", placeholderBranding.developer.privacyUrl);
    expect(screen.getByRole("link", { name: "Qualität" })).toHaveAttribute("href", "/qualitaet");
  });
```

In `components/site/site-header.test.tsx` add:

```ts
  it("links the quality and inquiry pages (FR-13, SC-13)", () => {
    render(<SiteHeader branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: "Qualität" })).toHaveAttribute("href", "/qualitaet");
    expect(screen.getByRole("link", { name: "Anfrage" })).toHaveAttribute("href", "/anfrage");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run config components/site`
Expected: FAIL.

- [ ] **Step 3: Implement the branding**

In `config/branding.ts`:

```ts
export const brandingSchema = z.object({
  companyName: z.string().min(1),
  shortName: z.string().min(1),
  officialSiteUrl: httpUrl,
  previewLabel: z.string().min(1),
  // Quality and environmental policy, one string per paragraph (spec D2).
  qualityPolicy: z.array(z.string().min(1)).min(1),
  developer: z.object({
    name: z.string().min(1),
    url: httpUrl,
    // The developer operates the preview, so their legal pages apply (spec D1).
    imprintUrl: httpUrl,
    privacyUrl: httpUrl,
  }),
});
```

Customer branding gets the policy text of the official quality page (consent given) and the developer URLs:

```ts
  qualityPolicy: [
    "Qualität und Umweltschutz sind für uns mehr als Normanforderungen, sie sind Teil unserer täglichen Verantwortung. Mit unserem integrierten Managementsystem nach ISO 9001 und ISO 14001 stellen wir sicher, dass unsere Prozesse zuverlässig, effizient und nachhaltig gestaltet sind.",
    "Wir arbeiten kundenorientiert, erfüllen konsequent alle gesetzlichen Vorgaben und setzen auf vorbeugende Qualitätssicherung statt Fehlerkorrektur. Gleichzeitig gehen wir verantwortungsvoll mit Energie und Rohstoffen um und verbessern unsere Abläufe kontinuierlich.",
    "So schaffen wir Vertrauen, sichern langfristige Partnerschaften und übernehmen Verantwortung für Umwelt und Zukunft.",
  ],
  developer: {
    name: "Eugen Moser",
    url: "https://eugen-moser.com",
    imprintUrl: "https://eugen-moser.com/impressum",
    privacyUrl: "https://eugen-moser.com/datenschutz",
  },
```

Placeholder branding:

```ts
  qualityPolicy: [
    "Platzhalter: Hier steht die Qualitäts- und Umweltpolitik des Unternehmens.",
  ],
  developer: {
    name: "Eugen Moser",
    url: "https://eugen-moser.com",
    imprintUrl: "https://eugen-moser.com/impressum",
    privacyUrl: "https://eugen-moser.com/datenschutz",
  },
```

Update the comment above `customerBranding` to say the policy text is customer content removed by the same switch.

- [ ] **Step 4: Header and footer**

`components/site/site-header.tsx`: the `<nav aria-label="Hauptnavigation">` renders three links in a flex row (`flex gap-x-6`), same classes as the existing link: `Produkte` → `/produkte`, `Qualität` → `/qualitaet`, `Anfrage` → `/anfrage`. Keep the comment that the header reads only branding.

`components/site/site-footer.tsx`: add a `<nav aria-label="Rechtliches und Service">` with links `Qualität` (`next/link` to `/qualitaet`), `Impressum` (`branding.developer.imprintUrl`), `Datenschutz` (`branding.developer.privacyUrl`), same link classes as the existing footer links. Layout: keep the two existing paragraphs; put the nav between them on `sm:` and below on mobile (`flex flex-wrap gap-x-4`).

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run config components/site && pnpm typecheck`
Expected: PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add config/ components/site/
git commit -m "feat(site): imprint, privacy and quality links; quality policy in branding"
```

---

### Task 4: Quality page

**Files:**

- Create: `lib/catalog/certificates.ts`
- Modify: `lib/catalog/types.ts` (add `CertificateView`)
- Modify: `lib/catalog/load.ts` (add `loadCertificates`)
- Create: `components/quality/certificate-card.tsx`, `components/quality/certificate-card.test.tsx`
- Create: `app/qualitaet/page.tsx`
- Create: `tests/integration/certificates-read.test.ts`

**Interfaces:**

- Consumes: tables from Task 1; `branding.qualityPolicy` from Task 3; `guard`, `toDbError` from `lib/catalog/errors.ts`; `unwrap` from `lib/catalog/load.ts`; `publicMediaUrl` from `lib/catalog/media.ts`.
- Produces:
  - `lib/catalog/types.ts`: `export type CertificateLanguage = "de" | "en"; export type CertificateView = { standard: string; title: string; preview: ImageRef; documents: { language: CertificateLanguage; storagePath: string }[] };`
  - `lib/catalog/certificates.ts`: `listCertificates(client?: CatalogClient): Promise<Result<CertificateView[], CatalogError>>` (sorted by `sort_order`, documents `de` before `en`)
  - `lib/catalog/load.ts`: `loadCertificates(): Promise<CertificateView[]>`
  - `components/quality/certificate-card.tsx`: `CertificateCard({ certificate }: { certificate: CertificateView })`

- [ ] **Step 1: Write the failing tests**

Create `components/quality/certificate-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CertificateView } from "@/lib/catalog/types";
import { CertificateCard } from "./certificate-card";

const certificate: CertificateView = {
  standard: "ISO 9001 (Beispiel)",
  title: "Qualitätsmanagement (Beispiel)",
  preview: {
    storagePath: "certificates/test-iso-9001.png",
    width: 600,
    height: 848,
    altText: "Beispielzertifikat ISO 9001",
  },
  documents: [
    { language: "de", storagePath: "certificates/test-iso-9001-de.pdf" },
    { language: "en", storagePath: "certificates/test-iso-9001-en.pdf" },
  ],
};

describe("CertificateCard (FR-6, SC-6)", () => {
  it("renders the preview with size and alt text", () => {
    render(<CertificateCard certificate={certificate} />);
    const img = screen.getByRole("img", {
      name: "Beispielzertifikat ISO 9001",
    });
    expect(img).toHaveAttribute("width", "600");
    expect(img).toHaveAttribute("height", "848");
  });

  it("renders standard, title and one download link per language", () => {
    render(<CertificateCard certificate={certificate} />);
    expect(
      screen.getByRole("heading", { name: "ISO 9001 (Beispiel)" })
    ).toBeVisible();
    expect(screen.getByText("Qualitätsmanagement (Beispiel)")).toBeVisible();
    expect(screen.getByRole("link", { name: /PDF, Deutsch/ })).toHaveAttribute(
      "href",
      "http://127.0.0.1:54321/storage/v1/object/public/catalog/certificates/test-iso-9001-de.pdf"
    );
    expect(screen.getByRole("link", { name: /PDF, Englisch/ })).toHaveAttribute(
      "href",
      "http://127.0.0.1:54321/storage/v1/object/public/catalog/certificates/test-iso-9001-en.pdf"
    );
  });
});
```

Create `tests/integration/certificates-read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listCertificates } from "@/lib/catalog/certificates";

describe("listCertificates (FR-6)", () => {
  it("reads the seeded certificate with its documents as anon", async () => {
    const result = await listCertificates();
    expect(result).toEqual({
      ok: true,
      value: [
        {
          standard: "ISO 9001 (Beispiel)",
          title: "Qualitätsmanagement (Beispiel)",
          preview: {
            storagePath: "certificates/test-iso-9001.png",
            width: 600,
            height: 848,
            altText: "Beispielzertifikat ISO 9001",
          },
          documents: [
            {
              language: "de",
              storagePath: "certificates/test-iso-9001-de.pdf",
            },
            {
              language: "en",
              storagePath: "certificates/test-iso-9001-en.pdf",
            },
          ],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run components/quality`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the read function and loader**

Add the types from **Produces** to `lib/catalog/types.ts`.

Create `lib/catalog/certificates.ts`:

```ts
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError, CertificateView } from "./types";

const rowSchema = z.object({
  standard: z.string(),
  title: z.string(),
  preview_path: z.string(),
  preview_width: z.number().int().positive(),
  preview_height: z.number().int().positive(),
  preview_alt: z.string(),
  certificate_document: z.array(
    z.object({ language: z.enum(["de", "en"]), storage_path: z.string() })
  ),
});

const LANGUAGE_ORDER = { de: 0, en: 1 } as const;

// Certificates for the quality page (spec D4); no draft state, RLS allows all rows.
export function listCertificates(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CertificateView[], CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("certificate")
      .select(
        "standard, title, preview_path, preview_width, preview_height, preview_alt, certificate_document(language, storage_path)"
      )
      .order("sort_order")
      .order("standard");
    if (error) return err(toDbError(error));
    const parsed = z.array(rowSchema).safeParse(data);
    if (!parsed.success)
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected certificate rows: ${parsed.error.message}`,
      });
    return ok(
      parsed.data.map((row) => ({
        standard: row.standard,
        title: row.title,
        preview: {
          storagePath: row.preview_path,
          width: row.preview_width,
          height: row.preview_height,
          altText: row.preview_alt,
        },
        documents: [...row.certificate_document]
          .sort(
            (a, b) => LANGUAGE_ORDER[a.language] - LANGUAGE_ORDER[b.language]
          )
          .map((d) => ({ language: d.language, storagePath: d.storage_path })),
      }))
    );
  });
}
```

In `lib/catalog/load.ts` add:

```ts
import { listCertificates } from "./certificates";

export const loadCertificates = cache(async () =>
  unwrap(await listCertificates(), "certificates")
);
```

- [ ] **Step 4: Implement the card**

Create `components/quality/certificate-card.tsx`:

```tsx
import Image from "next/image";
import { publicMediaUrl } from "@/lib/catalog/media";
import type { CertificateLanguage, CertificateView } from "@/lib/catalog/types";

const LANGUAGE_LABEL: Record<CertificateLanguage, string> = {
  de: "Deutsch",
  en: "Englisch",
};

export function CertificateCard({
  certificate,
}: {
  certificate: CertificateView;
}) {
  const { preview } = certificate;
  return (
    <article className="flex flex-col gap-4 rounded-md border border-line bg-paper p-4">
      <Image
        src={publicMediaUrl(preview.storagePath)}
        alt={preview.altText}
        width={preview.width}
        height={preview.height}
        sizes="(min-width: 640px) 18rem, 100vw"
        className="w-full max-w-72 rounded-sm bg-surface object-contain"
      />
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{certificate.standard}</h3>
        <p className="text-sm text-muted">{certificate.title}</p>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {certificate.documents.map((doc) => (
          <li key={doc.language}>
            <a
              href={publicMediaUrl(doc.storagePath)}
              aria-label={`${certificate.standard}: PDF, ${LANGUAGE_LABEL[doc.language]}`}
              className="text-accent underline underline-offset-2"
            >
              PDF, {LANGUAGE_LABEL[doc.language]}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
```

- [ ] **Step 5: Implement the page**

Create `app/qualitaet/page.tsx`:

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import { CertificateCard } from "@/components/quality/certificate-card";
import { branding } from "@/config/branding";
import { loadCertificates } from "@/lib/catalog/load";

export const metadata: Metadata = {
  title: "Qualität",
  description: "Qualitäts- und Umweltpolitik und ISO-Zertifikate.",
};

export default async function QualityPage() {
  await connection(); // per request: no database access during the build (spec D4)
  const certificates = await loadCertificates();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Qualitäts- und Umweltpolitik
        </h1>
        {branding.qualityPolicy.map((paragraph) => (
          <p key={paragraph} className="max-w-prose">
            {paragraph}
          </p>
        ))}
      </section>
      {certificates.length > 0 && (
        <section aria-labelledby="zertifikate" className="flex flex-col gap-4">
          <h2 id="zertifikate" className="text-xl font-semibold">
            Zertifikate
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((c) => (
              <li key={c.standard}>
                <CertificateCard certificate={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run the tests and build**

Run: `pnpm exec vitest run components/quality && pnpm db:test && pnpm typecheck`
Expected: PASS / exit 0.

Run: `pnpm db:stop && pnpm build; pnpm db:start`
Expected: build exits 0 with the database stopped; `/qualitaet` is listed as dynamic (ƒ).

- [ ] **Step 7: Commit**

```bash
git add lib/catalog/ components/quality/ app/qualitaet/ tests/integration/certificates-read.test.ts
git commit -m "feat(quality): quality page with certificates"
```

---

### Task 5: Order-number lookup, inquiry schema and sender

**Files:**

- Create: `supabase/migrations/20261011090100_find_variant.sql`
- Create: `supabase/tests/10_find_variant.test.sql`
- Modify: `lib/supabase/database.types.ts` (generated)
- Create: `lib/catalog/variant-lookup.ts`, `lib/catalog/variant-lookup.test.ts`
- Create: `tests/integration/variant-lookup.test.ts`
- Create: `lib/inquiry/schema.ts`, `lib/inquiry/schema.test.ts`
- Create: `lib/inquiry/sender.ts`
- Create: `lib/inquiry/path.ts`, `lib/inquiry/path.test.ts`

**Interfaces:**

- Consumes: `variant` view, `product`, `category` (RLS of the caller).
- Produces:
  - SQL `public.find_variant(q text) returns table (order_number text, product_name text, category_slug text, product_slug text)`, executable by `anon`, `authenticated`
  - `lib/catalog/variant-lookup.ts`: `export type VariantMatch = { orderNumber: string; productName: string; categorySlug: string; productSlug: string }`; `ORDER_NUMBER_MAX = 40`; `parseOrderNumberParam(raw: string | string[] | undefined): string | null`; `findVariant(q: string, client?: CatalogClient): Promise<Result<VariantMatch, CatalogError>>`
  - `lib/inquiry/schema.ts`: `INQUIRY_FIELDS`, `type InquiryField`, `type InquiryValues = Record<InquiryField, string>`, `type FieldErrors = Partial<Record<InquiryField, string>>`, `inquirySchema`, `type Inquiry = z.output<typeof inquirySchema>`, `readInquiryForm(formData: FormData): InquiryValues`, `fieldErrors(error: z.ZodError): FieldErrors`, `emptyInquiryValues(orderNumber?: string): InquiryValues`
  - `lib/inquiry/sender.ts`: `interface InquirySender { send(inquiry: Inquiry): Promise<Result<void, string>> }`, `class NoopInquirySender implements InquirySender`
  - `lib/inquiry/path.ts`: `inquiryPath(orderNumber?: string | null): string`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/10_find_variant.test.sql`:

```sql
begin;
select plan(8);

select ok(has_function_privilege('anon', 'public.find_variant(text)', 'execute'), 'anon can look up order numbers');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq($$select order_number, product_name, category_slug, product_slug from public.find_variant('99010 - 1')$$,
  $$values ('99010 - 1', 'Testkeil mit Dämpfung', 'moebelteile', 'testkeil-mit-daempfung')$$,
  'exact order number is found');
select results_eq($$select order_number from public.find_variant('99010-1')$$, $$values ('99010 - 1')$$,
  'spacing differences are ignored and the canonical number is returned (Review Focus 3)');
select results_eq($$select order_number from public.find_variant('  99010 -  1 ')$$, $$values ('99010 - 1')$$,
  'surrounding and repeated spaces are ignored');
select results_eq($$select order_number from public.find_variant('99300')$$, $$values ('99300')$$,
  'product without colours: the article number is the order number');
select is((select count(*) from public.find_variant('99400')), 0::bigint, 'a draft product''s number is not found');
select is((select count(*) from public.find_variant('99500')), 0::bigint, 'an archived product''s number is not found');
select is((select count(*) from public.find_variant('99010')), 0::bigint, 'a bare article number of a coloured product is not an order number');

reset role;
select * from finish();
rollback;
```

Check the category slug of product 1 in `supabase/seed.sql` (`moebelteile`, see `e2e/catalog.spec.ts`) and the seeded order numbers before running.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec supabase test db`
Expected: FAIL (`find_variant` does not exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261011090100_find_variant.sql`:

```sql
-- Order-number lookup for the inquiry form (feature 5, spec D5). Runs with
-- the caller's rights, so RLS hides unpublished products. Whitespace is
-- compared collapsed, like search_catalog.
create function public.find_variant(q text)
returns table (order_number text, product_name text, category_slug text, product_slug text)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.order_number, p.name, c.slug, p.slug
  from public.variant v
  join public.product p on p.id = v.product_id
  join public.category c on c.id = p.category_id
  where regexp_replace(lower(v.order_number), '\s+', '', 'g')
      = regexp_replace(lower(btrim(left(q, 40))), '\s+', '', 'g')
  order by v.article_sort_order, v.color_sort_order nulls first
  limit 1
$$;

revoke execute on function public.find_variant(text) from public, anon, authenticated;
grant execute on function public.find_variant(text) to anon, authenticated;
```

Run: `pnpm db:reset && pnpm exec supabase test db && pnpm db:types`
Expected: PASS.

- [ ] **Step 4: Write the failing unit tests**

Create `lib/catalog/variant-lookup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseOrderNumberParam } from "./variant-lookup";

describe("parseOrderNumberParam (FR-8, SC-8)", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["   ", null],
    [" 99010 - 1 ", "99010 - 1"],
    [["99010 - 1", "99011 - 2"], "99010 - 1"],
    ["x".repeat(41), null],
    ["x".repeat(500), null],
  ])("%j → %j (Review Focus 4)", (raw, expected) => {
    expect(parseOrderNumberParam(raw)).toBe(expected);
  });
});
```

Create `lib/inquiry/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  emptyInquiryValues,
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type InquiryValues,
} from "./schema";

const valid: InquiryValues = {
  orderNumber: "99010 - 1",
  quantity: "500",
  name: "Erika Muster",
  company: "",
  email: "erika@example.com",
  phone: "+49 (0)123 / 456-78",
  message: "",
  privacy: "on",
};

const errorsFor = (values: InquiryValues) => {
  const result = inquirySchema.safeParse(values);
  return result.success ? {} : fieldErrors(result.error);
};

describe("inquirySchema (FR-9, SC-9)", () => {
  it("accepts valid input and normalises empty optionals to null", () => {
    const result = inquirySchema.safeParse(valid);
    expect(result.success && result.data).toEqual({
      orderNumber: "99010 - 1",
      quantity: 500,
      name: "Erika Muster",
      company: null,
      email: "erika@example.com",
      phone: "+49 (0)123 / 456-78",
      message: null,
    });
  });

  it.each<[string, Partial<InquiryValues>, keyof InquiryValues, RegExp]>([
    [
      "order number too long",
      { orderNumber: "x".repeat(41) },
      "orderNumber",
      /40 Zeichen/,
    ],
    ["quantity not a number", { quantity: "viele" }, "quantity", /ganze Zahl/],
    ["quantity zero", { quantity: "0" }, "quantity", /ganze Zahl/],
    ["quantity too large", { quantity: "1000001" }, "quantity", /ganze Zahl/],
    ["quantity with decimals", { quantity: "1.5" }, "quantity", /ganze Zahl/],
    ["name missing", { name: "" }, "name", /Namen/],
    ["name too short", { name: "E" }, "name", /Namen/],
    ["name too long", { name: "x".repeat(101) }, "name", /100 Zeichen/],
    [
      "company too long",
      { company: "x".repeat(101) },
      "company",
      /100 Zeichen/,
    ],
    ["email invalid", { email: "erika@" }, "email", /E-Mail-Adresse/],
    [
      "email too long",
      { email: `${"x".repeat(250)}@example.com` },
      "email",
      /254 Zeichen|E-Mail-Adresse/,
    ],
    ["phone with letters", { phone: "0123 abc" }, "phone", /Ziffern/],
    ["phone too long", { phone: "1".repeat(41) }, "phone", /40 Zeichen/],
    [
      "message too long",
      { message: "x".repeat(2001) },
      "message",
      /2000 Zeichen/,
    ],
    ["privacy not confirmed", { privacy: "" }, "privacy", /Datenschutz/],
  ])("rejects %s with a German message", (_label, change, field, message) => {
    expect(errorsFor({ ...valid, ...change })[field]).toMatch(message);
  });

  it("needs an order number or a message", () => {
    expect(
      errorsFor({ ...valid, orderNumber: "", message: "" }).message
    ).toMatch(/Bestellnummer oder eine Nachricht/);
    expect(
      inquirySchema.safeParse({
        ...valid,
        orderNumber: "",
        message: "Bitte um Muster.",
      }).success
    ).toBe(true);
  });
});

describe("readInquiryForm", () => {
  it("reads every field as a string and a missing checkbox as empty", () => {
    const fd = new FormData();
    fd.set("name", "Erika");
    fd.set("unknown", "ignored");
    expect(readInquiryForm(fd)).toEqual({
      ...emptyInquiryValues(),
      name: "Erika",
    });
  });

  it("prefills the order number", () => {
    expect(emptyInquiryValues("99010 - 1").orderNumber).toBe("99010 - 1");
  });
});
```

Create `lib/inquiry/path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inquiryPath } from "./path";

describe("inquiryPath (FR-13, SC-13)", () => {
  it.each([
    [undefined, "/anfrage"],
    [null, "/anfrage"],
    ["", "/anfrage"],
    ["99010 - 1", "/anfrage?bestellnummer=99010%20-%201"],
    ["99211/80 - 0", "/anfrage?bestellnummer=99211%2F80%20-%200"],
  ])("%j → %s", (number, expected) => {
    expect(inquiryPath(number)).toBe(expected);
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm exec vitest run lib/catalog/variant-lookup.test.ts lib/inquiry`
Expected: FAIL (modules missing).

- [ ] **Step 6: Implement**

Create `lib/catalog/variant-lookup.ts`:

```ts
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import { guard, toDbError } from "./errors";
import type { CatalogError } from "./types";

export const ORDER_NUMBER_MAX = 40;

export type VariantMatch = {
  orderNumber: string;
  productName: string;
  categorySlug: string;
  productSlug: string;
};

// `?bestellnummer=` on /anfrage: first value, trimmed, 1–40 characters, otherwise ignored.
export function parseOrderNumberParam(
  raw: string | string[] | undefined
): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = (first ?? "").trim();
  return value === "" || value.length > ORDER_NUMBER_MAX ? null : value;
}

const rowSchema = z.object({
  order_number: z.string(),
  product_name: z.string(),
  category_slug: z.string(),
  product_slug: z.string(),
});

export function findVariant(
  q: string,
  client: CatalogClient = createServerSupabase()
): Promise<Result<VariantMatch, CatalogError>> {
  return guard(async () => {
    const { data, error } = await client.rpc("find_variant", { q });
    if (error) return err(toDbError(error));
    const parsed = z.array(rowSchema).safeParse(data);
    if (!parsed.success)
      return err({
        kind: "db_error",
        code: null,
        message: `unexpected find_variant result: ${parsed.error.message}`,
      });
    const row = parsed.data[0];
    if (!row) return err({ kind: "not_found" });
    return ok({
      orderNumber: row.order_number,
      productName: row.product_name,
      categorySlug: row.category_slug,
      productSlug: row.product_slug,
    });
  });
}
```

Create `lib/inquiry/schema.ts` (no server-only imports; used by the client form):

```ts
import { z } from "zod";

export const INQUIRY_FIELDS = [
  "orderNumber",
  "quantity",
  "name",
  "company",
  "email",
  "phone",
  "message",
  "privacy",
] as const;
export type InquiryField = (typeof INQUIRY_FIELDS)[number];
export type InquiryValues = Record<InquiryField, string>;
export type FieldErrors = Partial<Record<InquiryField, string>>;

const maxText = (max: number) =>
  z.string().trim().max(max, `Bitte höchstens ${max} Zeichen eingeben.`);
const orNull = (value: string) => (value === "" ? null : value);
const QUANTITY_MESSAGE = "Bitte eine ganze Zahl von 1 bis 1.000.000 eingeben.";

// Shared by the browser and the Server Action (spec D6). Input: raw form strings.
export const inquirySchema = z
  .object({
    orderNumber: maxText(40),
    quantity: z
      .string()
      .trim()
      .refine(
        (v) =>
          v === "" ||
          (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000),
        QUANTITY_MESSAGE
      ),
    name: z
      .string()
      .trim()
      .min(2, "Bitte geben Sie Ihren Namen an.")
      .max(100, "Bitte höchstens 100 Zeichen eingeben."),
    company: maxText(100),
    email: z
      .string()
      .trim()
      .max(254, "Bitte höchstens 254 Zeichen eingeben.")
      .pipe(z.email("Bitte geben Sie eine gültige E-Mail-Adresse an.")),
    phone: maxText(40).regex(
      /^[\d\s+\-/()]*$/,
      "Bitte nur Ziffern, Leerzeichen und + - / ( ) verwenden."
    ),
    message: maxText(2000),
    privacy: z.literal("on", {
      error:
        "Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.",
    }),
  })
  .refine((v) => v.orderNumber !== "" || v.message !== "", {
    path: ["message"],
    message: "Bitte geben Sie eine Bestellnummer oder eine Nachricht an.",
  })
  .transform((v) => ({
    orderNumber: orNull(v.orderNumber),
    quantity: v.quantity === "" ? null : Number(v.quantity),
    name: v.name,
    company: orNull(v.company),
    email: v.email,
    phone: orNull(v.phone),
    message: orNull(v.message),
  }));

export type Inquiry = z.output<typeof inquirySchema>;

export function emptyInquiryValues(orderNumber = ""): InquiryValues {
  return {
    orderNumber,
    quantity: "",
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
    privacy: "",
  };
}

export function readInquiryForm(formData: FormData): InquiryValues {
  const values = emptyInquiryValues();
  for (const field of INQUIRY_FIELDS) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

// First message per field.
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      typeof field === "string" &&
      (INQUIRY_FIELDS as readonly string[]).includes(field)
    ) {
      const key = field as InquiryField;
      errors[key] ??= issue.message;
    }
  }
  return errors;
}
```

Note on `z.literal("on", { error })`: if the installed Zod version rejects the `error` key, use `{ message: "…" }`; run the test to confirm the German message is returned.

Create `lib/inquiry/sender.ts`:

```ts
import { ok, type Result } from "@/lib/result";
import type { Inquiry } from "./schema";

export interface InquirySender {
  send(inquiry: Inquiry): Promise<Result<void, string>>;
}

// The preview never sends inquiries (roadmap: validate and discard).
export class NoopInquirySender implements InquirySender {
  async send(): Promise<Result<void, string>> {
    return ok(undefined);
  }
}
```

Create `lib/inquiry/path.ts`:

```ts
export function inquiryPath(orderNumber?: string | null): string {
  return orderNumber
    ? `/anfrage?bestellnummer=${encodeURIComponent(orderNumber)}`
    : "/anfrage";
}
```

- [ ] **Step 7: Integration test for the lookup**

Create `tests/integration/variant-lookup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findVariant } from "@/lib/catalog/variant-lookup";

describe("findVariant (FR-8, SC-8)", () => {
  it("finds a seeded order number with product data", async () => {
    expect(await findVariant("99010-1")).toEqual({
      ok: true,
      value: {
        orderNumber: "99010 - 1",
        productName: "Testkeil mit Dämpfung",
        categorySlug: "moebelteile",
        productSlug: "testkeil-mit-daempfung",
      },
    });
  });

  it.each(["00000", "99400"])(
    "returns not_found for %s (unknown, draft)",
    async (q) => {
      expect(await findVariant(q)).toEqual({
        ok: false,
        error: { kind: "not_found" },
      });
    }
  );
});
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run lib && pnpm db:test && pnpm typecheck`
Expected: PASS / exit 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/ lib/ tests/integration/variant-lookup.test.ts
git commit -m "feat(inquiry): order-number lookup, shared schema and noop sender"
```

---

### Task 6: Server Action, form and inquiry page

**Files:**

- Create: `lib/inquiry/submit.ts`, `lib/inquiry/submit.test.ts`
- Create: `app/anfrage/actions.ts`
- Create: `app/anfrage/page.tsx`
- Create: `components/inquiry/inquiry-form.tsx`, `components/inquiry/inquiry-form.test.tsx`
- Create: `components/inquiry/inquiry-result.tsx`
- Create: `components/inquiry/demo-notice.tsx`

**Interfaces:**

- Consumes: everything Task 5 produces; `branding.officialSiteUrl`, `branding.developer.privacyUrl`; `productPath(categorySlug, productSlug)` from `lib/catalog/anchors.ts`.
- Produces:
  - `lib/inquiry/submit.ts`: `type InquiryState = { status: "editing"; values: InquiryValues; fieldErrors: FieldErrors; formError: string | null } | { status: "discarded"; orderNumber: string | null; productName: string | null; quantity: number | null }`; `type InquiryDeps = { findVariant: (q: string) => Promise<Result<VariantMatch, CatalogError>>; sender: InquirySender; logError: (message: string, detail: string) => void }`; `initialInquiryState(orderNumber?: string): InquiryState`; `handleInquiry(formData: FormData, deps: InquiryDeps): Promise<InquiryState>`; constant `LOOKUP_UNAVAILABLE = "Prüfung derzeit nicht möglich. Bitte versuchen Sie es später erneut."`
  - `app/anfrage/actions.ts`: `submitInquiry(prev: InquiryState, formData: FormData): Promise<InquiryState>` (`"use server"`)
  - `components/inquiry/inquiry-form.tsx`: `InquiryForm({ action, initialState, prefill, privacyUrl, officialSiteUrl })` with `type Prefill = { kind: "none" } | { kind: "found"; match: VariantMatch } | { kind: "unknown" }`

- [ ] **Step 1: Write the failing action tests**

Create `lib/inquiry/submit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import { handleInquiry, LOOKUP_UNAVAILABLE, type InquiryDeps } from "./submit";

const MATCH: VariantMatch = {
  orderNumber: "99010 - 1",
  productName: "Testkeil mit Dämpfung",
  categorySlug: "moebelteile",
  productSlug: "testkeil-mit-daempfung",
};

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const VALID = {
  orderNumber: "99010-1",
  quantity: "500",
  name: "Erika Muster",
  email: "erika@example.com",
  privacy: "on",
};

function deps(over: Partial<InquiryDeps> = {}) {
  return {
    findVariant: vi.fn(async () => ok(MATCH)),
    sender: { send: vi.fn(async () => ok(undefined)) },
    logError: vi.fn(),
    ...over,
  } satisfies InquiryDeps;
}

describe("handleInquiry (FR-10, SC-10)", () => {
  it("returns field errors and the submitted values without calling the sender", async () => {
    const d = deps();
    const state = await handleInquiry(form({ ...VALID, email: "kaputt" }), d);
    expect(state.status).toBe("editing");
    if (state.status !== "editing") return;
    expect(state.fieldErrors.email).toMatch(/E-Mail-Adresse/);
    expect(state.values).toMatchObject({
      name: "Erika Muster",
      email: "kaputt",
      orderNumber: "99010-1",
    });
    expect(d.sender.send).not.toHaveBeenCalled();
    expect(d.findVariant).not.toHaveBeenCalled();
  });

  it("reports an unknown order number as a field error", async () => {
    const d = deps({
      findVariant: vi.fn(async () => err({ kind: "not_found" as const })),
    });
    const state = await handleInquiry(form(VALID), d);
    expect(state.status === "editing" && state.fieldErrors.orderNumber).toMatch(
      /nicht im Katalog/
    );
    expect(d.sender.send).not.toHaveBeenCalled();
  });

  it("reports a lookup error as a form error and logs no submitted value (FR-12, SC-12, Review Focus 5)", async () => {
    const d = deps({
      findVariant: vi.fn(async () =>
        err({
          kind: "db_error" as const,
          code: "08006",
          message: "connection refused for 99010-1",
        })
      ),
    });
    const state = await handleInquiry(
      form({ ...VALID, phone: "0123 456", message: "Geheim" }),
      d
    );
    expect(state.status === "editing" && state.formError).toBe(
      LOOKUP_UNAVAILABLE
    );
    expect(state.status === "editing" && state.values.name).toBe(
      "Erika Muster"
    );
    expect(d.logError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(d.logError.mock.calls);
    for (const value of [
      "Erika Muster",
      "erika@example.com",
      "99010",
      "500",
      "0123 456",
      "Geheim",
    ]) {
      expect(logged).not.toContain(value);
    }
  });

  it("calls the sender once and returns discarded with the canonical order number", async () => {
    const d = deps();
    expect(await handleInquiry(form(VALID), d)).toEqual({
      status: "discarded",
      orderNumber: "99010 - 1",
      productName: "Testkeil mit Dämpfung",
      quantity: 500,
    });
    expect(d.sender.send).toHaveBeenCalledTimes(1);
  });

  it("does not look up anything without an order number", async () => {
    const d = deps();
    const state = await handleInquiry(
      form({ ...VALID, orderNumber: "", message: "Bitte um Muster." }),
      d
    );
    expect(state).toEqual({
      status: "discarded",
      orderNumber: null,
      productName: null,
      quantity: 500,
    });
    expect(d.findVariant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement `submit.ts`**

Run: `pnpm exec vitest run lib/inquiry/submit.test.ts` — Expected: FAIL.

Create `lib/inquiry/submit.ts` (type-only imports from server modules, so it stays unit-testable):

```ts
import type { CatalogError } from "@/lib/catalog/types";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import type { Result } from "@/lib/result";
import {
  emptyInquiryValues,
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type FieldErrors,
  type InquiryValues,
} from "./schema";
import type { InquirySender } from "./sender";

export type InquiryState =
  | {
      status: "editing";
      values: InquiryValues;
      fieldErrors: FieldErrors;
      formError: string | null;
    }
  | {
      status: "discarded";
      orderNumber: string | null;
      productName: string | null;
      quantity: number | null;
    };

export type InquiryDeps = {
  findVariant: (q: string) => Promise<Result<VariantMatch, CatalogError>>;
  sender: InquirySender;
  // Never receives submitted values (spec D6).
  logError: (message: string, detail: string) => void;
};

export const LOOKUP_UNAVAILABLE =
  "Prüfung derzeit nicht möglich. Bitte versuchen Sie es später erneut.";
const UNKNOWN_ORDER_NUMBER =
  "Diese Bestellnummer ist nicht im Katalog. Bitte prüfen Sie die Eingabe.";
const SEND_FAILED =
  "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.";

export function initialInquiryState(orderNumber = ""): InquiryState {
  return {
    status: "editing",
    values: emptyInquiryValues(orderNumber),
    fieldErrors: {},
    formError: null,
  };
}

const editing = (
  values: InquiryValues,
  errors: FieldErrors,
  formError: string | null = null
): InquiryState => ({
  status: "editing",
  values,
  fieldErrors: errors,
  formError,
});

export async function handleInquiry(
  formData: FormData,
  deps: InquiryDeps
): Promise<InquiryState> {
  const values = readInquiryForm(formData);
  const parsed = inquirySchema.safeParse(values);
  if (!parsed.success) return editing(values, fieldErrors(parsed.error));
  const inquiry = parsed.data;

  let match: VariantMatch | null = null;
  if (inquiry.orderNumber !== null) {
    const found = await deps.findVariant(inquiry.orderNumber);
    if (!found.ok) {
      if (found.error.kind === "not_found")
        return editing(values, { orderNumber: UNKNOWN_ORDER_NUMBER });
      deps.logError(
        "[inquiry] order number lookup failed",
        found.error.code ?? "unknown"
      );
      return editing(values, {}, LOOKUP_UNAVAILABLE);
    }
    match = found.value;
  }

  const sent = await deps.sender.send({
    ...inquiry,
    orderNumber: match?.orderNumber ?? null,
  });
  if (!sent.ok) {
    deps.logError("[inquiry] sender failed", "sender");
    return editing(values, {}, SEND_FAILED);
  }
  return {
    status: "discarded",
    orderNumber: match?.orderNumber ?? null,
    productName: match?.productName ?? null,
    quantity: inquiry.quantity,
  };
}
```

Run: `pnpm exec vitest run lib/inquiry/submit.test.ts` — Expected: PASS.

- [ ] **Step 3: Server Action**

Read `node_modules/next/dist/docs/01-app/02-guides/forms.md` (sections on Server Actions, `useActionState`, progressive enhancement) first.

Create `app/anfrage/actions.ts`:

```ts
"use server";

import { findVariant } from "@/lib/catalog/variant-lookup";
import { NoopInquirySender } from "@/lib/inquiry/sender";
import { handleInquiry, type InquiryState } from "@/lib/inquiry/submit";

const sender = new NoopInquirySender();

// Validates and discards (spec D6). Origin check against CSRF is built into
// Server Actions; nothing is sent or stored, so there is no rate limit (D7).
export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  return handleInquiry(formData, {
    findVariant: (q) => findVariant(q),
    sender,
    logError: (message, detail) => console.error(message, detail),
  });
}
```

- [ ] **Step 4: Write the failing form tests**

Create `components/inquiry/inquiry-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { initialInquiryState, type InquiryState } from "@/lib/inquiry/submit";
import { InquiryForm } from "./inquiry-form";

const PROPS = {
  privacyUrl: "https://dev.example/datenschutz",
  officialSiteUrl: "https://example.com",
};

describe("InquiryForm (FR-8, FR-11)", () => {
  it("prefills the order number and shows the product link", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState("99010 - 1")}
        prefill={{
          kind: "found",
          match: {
            orderNumber: "99010 - 1",
            productName: "Testkeil mit Dämpfung",
            categorySlug: "moebelteile",
            productSlug: "testkeil-mit-daempfung",
          },
        }}
      />
    );
    expect(screen.getByLabelText(/Bestellnummer/)).toHaveValue("99010 - 1");
    expect(
      screen.getByRole("link", { name: "Testkeil mit Dämpfung" })
    ).toHaveAttribute("href", "/produkte/moebelteile/testkeil-mit-daempfung");
  });

  it("shows a hint for an unknown prefilled number", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState("00000")}
        prefill={{ kind: "unknown" }}
      />
    );
    expect(screen.getByText(/nicht im Katalog/)).toBeVisible();
  });

  it("validates in the browser with the shared schema and does not call the action", async () => {
    const action = vi.fn(async (s: InquiryState) => s);
    render(
      <InquiryForm
        {...PROPS}
        action={action}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    await userEvent.type(screen.getByLabelText(/E-Mail/), "kaputt");
    await userEvent.click(
      screen.getByRole("button", { name: /Anfrage prüfen/ })
    );
    expect(await screen.findByText(/gültige E-Mail-Adresse/)).toBeVisible();
    expect(screen.getByLabelText(/E-Mail/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("links the privacy policy in the consent label", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    expect(
      screen.getByRole("link", { name: /Datenschutzhinweise/ })
    ).toHaveAttribute("href", PROPS.privacyUrl);
  });

  it("replaces the form with the result panel after a discarded submit", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={{
          status: "discarded",
          orderNumber: "99010 - 1",
          productName: "Testkeil mit Dämpfung",
          quantity: 500,
        }}
        prefill={{ kind: "none" }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(/nicht versendet/);
    expect(screen.getByRole("status")).toHaveTextContent("99010 - 1");
    expect(
      screen.getByRole("link", { name: /offizielle Website/ })
    ).toHaveAttribute("href", PROPS.officialSiteUrl);
    expect(screen.queryByRole("button", { name: /Anfrage prüfen/ })).toBeNull();
  });
});
```

Check `package.json` for `@testing-library/user-event`; if it is not installed, use `fireEvent.change` / `fireEvent.submit` from `@testing-library/react` instead (no new dependency).

Run: `pnpm exec vitest run components/inquiry` — Expected: FAIL.

- [ ] **Step 5: Implement result panel, demo notice and form**

Create `components/inquiry/demo-notice.tsx`:

```tsx
export function InquiryDemoNotice({
  officialSiteUrl,
}: {
  officialSiteUrl: string;
}) {
  return (
    <aside
      aria-label="Hinweis zum Formular"
      className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p>
        <span className="font-semibold">Vorschau:</span> Anfragen über dieses
        Formular werden geprüft, aber nicht versendet. Für echte Anfragen nutzen
        Sie bitte die{" "}
        <a href={officialSiteUrl} className="underline underline-offset-2">
          offizielle Website
        </a>
        .
      </p>
    </aside>
  );
}
```

Create `components/inquiry/inquiry-result.tsx`:

```tsx
type Props = {
  orderNumber: string | null;
  productName: string | null;
  quantity: number | null;
  officialSiteUrl: string;
};

export function InquiryResult({
  orderNumber,
  productName,
  quantity,
  officialSiteUrl,
}: Props) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6"
    >
      <p className="font-semibold">
        Ihre Anfrage ist gültig, wurde aber nicht versendet – dies ist eine
        Vorschau.
      </p>
      {(orderNumber || quantity) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {orderNumber && (
            <>
              <dt className="text-muted">Bestellnummer</dt>
              <dd className="font-mono">{orderNumber}</dd>
            </>
          )}
          {productName && (
            <>
              <dt className="text-muted">Produkt</dt>
              <dd>{productName}</dd>
            </>
          )}
          {quantity !== null && (
            <>
              <dt className="text-muted">Menge</dt>
              <dd>{quantity.toLocaleString("de-DE")}</dd>
            </>
          )}
        </dl>
      )}
      <p className="text-sm">
        Für eine echte Anfrage wenden Sie sich bitte über die{" "}
        <a
          href={officialSiteUrl}
          className="text-accent underline underline-offset-2"
        >
          offizielle Website
        </a>{" "}
        an das Unternehmen.
      </p>
    </div>
  );
}
```

Create `components/inquiry/inquiry-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import {
  useActionState,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { productPath } from "@/lib/catalog/anchors";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import {
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type FieldErrors,
  type InquiryField,
} from "@/lib/inquiry/schema";
import type { InquiryState } from "@/lib/inquiry/submit";
import { InquiryResult } from "./inquiry-result";

export type Prefill =
  | { kind: "none" }
  | { kind: "found"; match: VariantMatch }
  | { kind: "unknown" };

type Props = {
  action: (prev: InquiryState, formData: FormData) => Promise<InquiryState>;
  initialState: InquiryState;
  prefill: Prefill;
  privacyUrl: string;
  officialSiteUrl: string;
};

export function InquiryForm({
  action,
  initialState,
  prefill,
  privacyUrl,
  officialSiteUrl,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);

  if (state.status === "discarded") {
    return <InquiryResult {...state} officialSiteUrl={officialSiteUrl} />;
  }

  const errors = clientErrors ?? state.fieldErrors;
  const values = state.values;

  // Same schema as the server (spec D6); the server validates again.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const parsed = inquirySchema.safeParse(
      readInquiryForm(new FormData(event.currentTarget))
    );
    if (parsed.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    setClientErrors(fieldErrors(parsed.error));
  }

  const field = (
    name: InquiryField,
    label: string,
    input: (props: FieldProps) => ReactNode,
    extra?: ReactNode
  ) => (
    <Field name={name} label={label} error={errors[name]} extra={extra}>
      {input({
        id: `anfrage-${name}`,
        name,
        defaultValue: values[name],
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? `anfrage-${name}-fehler` : undefined,
        className: "w-full rounded-md border border-line bg-paper px-3 py-2",
      })}
    </Field>
  );

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {state.formError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {state.formError}
        </p>
      )}
      {field(
        "orderNumber",
        "Bestellnummer",
        (p) => (
          <input {...p} maxLength={40} className={`${p.className} font-mono`} />
        ),
        <PrefillHint prefill={prefill} />
      )}
      {field("quantity", "Menge (optional)", (p) => (
        <input {...p} inputMode="numeric" />
      ))}
      {field("name", "Name", (p) => (
        <input {...p} autoComplete="name" />
      ))}
      {field("company", "Firma (optional)", (p) => (
        <input {...p} autoComplete="organization" />
      ))}
      {field("email", "E-Mail", (p) => (
        <input {...p} type="email" autoComplete="email" />
      ))}
      {field("phone", "Telefon (optional)", (p) => (
        <input {...p} type="tel" autoComplete="tel" />
      ))}
      {field("message", "Nachricht", (p) => (
        <textarea {...p} rows={5} />
      ))}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="privacy"
            defaultChecked={values.privacy === "on"}
            aria-invalid={errors.privacy ? true : undefined}
            aria-describedby={
              errors.privacy ? "anfrage-privacy-fehler" : undefined
            }
            className="mt-1"
          />
          <span>
            Ich habe die{" "}
            <a
              href={privacyUrl}
              className="text-accent underline underline-offset-2"
            >
              Datenschutzhinweise
            </a>{" "}
            gelesen.
          </span>
        </label>
        {errors.privacy && (
          <p id="anfrage-privacy-fehler" className="text-sm text-red-800">
            {errors.privacy}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-accent px-4 py-2 font-medium text-paper disabled:opacity-60"
      >
        Anfrage prüfen (wird nicht versendet)
      </button>
    </form>
  );
}

type FieldProps = {
  id: string;
  name: InquiryField;
  defaultValue: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
  className: string;
};

function Field({
  name,
  label,
  error,
  extra,
  children,
}: {
  name: InquiryField;
  label: string;
  error?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`anfrage-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {extra}
      {error && (
        <p id={`anfrage-${name}-fehler`} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function PrefillHint({ prefill }: { prefill: Prefill }) {
  if (prefill.kind === "found")
    return (
      <p className="text-sm text-muted">
        Produkt:{" "}
        <Link
          href={productPath(
            prefill.match.categorySlug,
            prefill.match.productSlug
          )}
          className="text-accent underline underline-offset-2"
        >
          {prefill.match.productName}
        </Link>
      </p>
    );
  if (prefill.kind === "unknown")
    return (
      <p className="text-sm text-muted">
        Diese Bestellnummer ist nicht im Katalog. Sie können sie korrigieren
        oder leer lassen.
      </p>
    );
  return null;
}
```

Notes for the implementer:

- `productPath` must exist in `lib/catalog/anchors.ts` with signature `(categorySlug, productSlug) => string`; check and adapt the call. `anchors.ts` must not import `server-only`; if it does, build the path inline (`/produkte/${c}/${p}`).
- `lib/catalog/variant-lookup.ts` imports `server-only` through `createServerSupabase`; the form only imports its **type** (`import type`), which is erased. Keep it type-only.
- Values survive React's automatic form reset because every input's `defaultValue` comes from the returned state (Review Focus 2); the e2e test in Task 8 proves it.
- Check the colour tokens (`text-accent`, `bg-accent`, `text-paper`, `border-line`, `bg-surface`, `text-muted`) exist in `app/globals.css`; reuse what the product page uses.

- [ ] **Step 6: Inquiry page**

Create `app/anfrage/page.tsx`:

```tsx
import type { Metadata } from "next";
import { InquiryDemoNotice } from "@/components/inquiry/demo-notice";
import { InquiryForm, type Prefill } from "@/components/inquiry/inquiry-form";
import { branding } from "@/config/branding";
import {
  findVariant,
  parseOrderNumberParam,
} from "@/lib/catalog/variant-lookup";
import { initialInquiryState } from "@/lib/inquiry/submit";
import { submitInquiry } from "./actions";

export const metadata: Metadata = {
  title: "Anfrage",
  description:
    "Anfrage zu einer Bestellnummer (Vorschau, wird nicht versendet).",
};

// searchParams makes this page render per request (spec D5).
export default async function InquiryPage({
  searchParams,
}: PageProps<"/anfrage">) {
  const { bestellnummer } = await searchParams;
  const orderNumber = parseOrderNumberParam(bestellnummer);

  let prefill: Prefill = { kind: "none" };
  let initialNumber = orderNumber ?? "";
  if (orderNumber) {
    const found = await findVariant(orderNumber);
    if (found.ok) {
      prefill = { kind: "found", match: found.value };
      initialNumber = found.value.orderNumber;
    } else if (found.error.kind === "not_found") {
      prefill = { kind: "unknown" };
    } else {
      // A failed lookup never breaks the page; the action checks again.
      console.error(
        "[inquiry] prefill lookup failed",
        found.error.code ?? "unknown"
      );
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Anfrage</h1>
      <InquiryDemoNotice officialSiteUrl={branding.officialSiteUrl} />
      <InquiryForm
        action={submitInquiry}
        initialState={initialInquiryState(initialNumber)}
        prefill={prefill}
        privacyUrl={branding.developer.privacyUrl}
        officialSiteUrl={branding.officialSiteUrl}
      />
    </main>
  );
}
```

- [ ] **Step 7: Run tests, typecheck, build**

Run: `pnpm exec vitest run lib components && pnpm typecheck && pnpm lint`
Expected: PASS / exit 0.

Run: `pnpm db:stop && pnpm build; pnpm db:start`
Expected: build exits 0 with the database stopped; `/anfrage` is dynamic (ƒ).

- [ ] **Step 8: Commit**

```bash
git add lib/inquiry/ app/anfrage/ components/inquiry/
git commit -m "feat(inquiry): inquiry page with Server Action and noop sender"
```

---

### Task 7: Entry points on the product page

**Files:**

- Modify: `components/catalog/order-number-list.tsx`, `components/catalog/order-number-list.test.tsx`
- Modify: `app/produkte/[category]/[product]/page.tsx`

**Interfaces:**

- Consumes: `inquiryPath` from `lib/inquiry/path.ts` (Task 5); `buildVariantMatrix` result `matrix.byArticle[articleNumber].fallback` (default colour's order number or bare article number).

- [ ] **Step 1: Write the failing test**

In `components/catalog/order-number-list.test.tsx` add (reuse the file's existing fixture for `page`):

```tsx
it("links every order number to the inquiry form (FR-13, SC-13)", () => {
  render(<OrderNumberList page={page} />);
  for (const v of page.variants) {
    expect(
      screen.getByRole("link", { name: new RegExp(v.orderNumber) })
    ).toHaveAttribute(
      "href",
      `/anfrage?bestellnummer=${encodeURIComponent(v.orderNumber)}`
    );
  }
});
```

Run: `pnpm exec vitest run components/catalog/order-number-list.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement**

In `components/catalog/order-number-list.tsx` wrap the number:

```tsx
<Link
  href={inquiryPath(v.orderNumber)}
  className="font-mono underline-offset-2 hover:text-accent hover:underline"
>
  {v.orderNumber}
  <span className="sr-only"> anfragen</span>
</Link>
```

(imports: `Link` from `next/link`, `inquiryPath` from `@/lib/inquiry/path`). Keep the colour name after the link.

In `app/produkte/[category]/[product]/page.tsx` replace the `<a href={branding.officialSiteUrl} …>Anfrage über die offizielle Website</a>` with:

```tsx
<Link
  href={inquiryPath(defaultOrderNumber)}
  className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper"
>
  Anfrage stellen
</Link>
```

and compute above the JSX:

```tsx
// D8: first article in the default colour (or its bare number).
const firstArticle = page.articles[0];
const defaultOrderNumber = firstArticle
  ? (matrix.byArticle[firstArticle.articleNumber]?.fallback ?? null)
  : null;
```

Remove the `branding` import if it becomes unused. Check the existing e2e and unit tests that referenced "Anfrage über die offizielle Website" (`grep -rn "offizielle Website" e2e components app`) and update them.

- [ ] **Step 3: Run tests and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: exit 0.

```bash
git add components/catalog/ "app/produkte/[category]/[product]/page.tsx"
git commit -m "feat(catalog): inquiry links on the product page"
```

---

### Task 8: E2E, accessibility, docs and full verification

**Files:**

- Create: `e2e/content.spec.ts`, `e2e/inquiry.spec.ts`
- Modify: `e2e/noindex.spec.ts`, `e2e/a11y.spec.ts`
- Modify: `docs/roadmap.md` (decision rows), `docs/specs/2026-10-09-content-inquiry-design.md` (status)

**Interfaces:**

- Consumes: all pages from Tasks 3–7; seed data (Task 1).

- [ ] **Step 1: Write the E2E tests**

Create `e2e/content.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { branding } from "../config/branding";

test.describe("content pages", () => {
  test("quality page shows policy and the seeded certificate (SC-6)", async ({
    page,
  }) => {
    await page.goto("/qualitaet");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Qualitäts- und Umweltpolitik"
    );
    await expect(page.getByText(branding.qualityPolicy[0] ?? "")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ISO 9001 (Beispiel)" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /PDF, Deutsch/ })
    ).toHaveAttribute(
      "href",
      /\/storage\/v1\/object\/public\/catalog\/certificates\/test-iso-9001-de\.pdf$/
    );
    await expect(
      page.getByRole("link", { name: /PDF, Englisch/ })
    ).toHaveAttribute(
      "href",
      /\/catalog\/certificates\/test-iso-9001-en\.pdf$/
    );
  });

  test("footer links imprint and privacy on every page type (SC-1)", async ({
    page,
  }) => {
    for (const path of ["/", "/qualitaet", "/anfrage"]) {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      await expect(
        footer.getByRole("link", { name: "Impressum" })
      ).toHaveAttribute("href", branding.developer.imprintUrl);
      await expect(
        footer.getByRole("link", { name: "Datenschutz" })
      ).toHaveAttribute("href", branding.developer.privacyUrl);
    }
  });
});
```

If importing `../config/branding` fails in Playwright (module resolution), read the expected URLs from `process.env` is **not** an option; instead hard-code the developer URLs (they are not customer data) and assert the policy via the first 20 characters of the paragraph found by `page.locator("main p").first()` being non-empty.

Create `e2e/inquiry.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";

async function fillValid(page: Page) {
  await page.getByLabel("Name").fill("Erika Muster");
  await page.getByLabel("E-Mail").fill("erika@example.com");
  await page.getByLabel("Menge (optional)").fill("500");
  await page.getByRole("checkbox").check();
}

test.describe("inquiry", () => {
  test("prefill shows number, product link and demo notice (SC-8)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=99010-1");
    await expect(page.getByLabel("Bestellnummer")).toHaveValue("99010 - 1");
    await expect(
      page.getByRole("link", { name: "Testkeil mit Dämpfung" }).first()
    ).toHaveAttribute("href", PRODUCT);
    const notice = page.getByRole("complementary", {
      name: "Hinweis zum Formular",
    });
    await expect(notice).toContainText("nicht versendet");
    await expect(
      notice.getByRole("link", { name: "offizielle Website" })
    ).toBeVisible();
  });

  test("unknown number shows a hint, odd parameters do not break the page (SC-8, Review Focus 4)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=00000");
    await expect(page.getByText(/nicht im Katalog/)).toBeVisible();
    for (const query of [
      `?bestellnummer=${"x".repeat(500)}`,
      "?bestellnummer=a&bestellnummer=b",
      "?bestellnummer=",
    ]) {
      const response = await page.goto(`/anfrage${query}`);
      expect(response?.status(), query).toBe(200);
    }
  });

  test("valid submit with JavaScript shows the result panel (SC-11)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=99010%20-%201");
    await fillValid(page);
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("nicht versendet");
    await expect(status).toContainText("99010 - 1");
  });

  test("invalid e-mail shows the field error (SC-11)", async ({ page }) => {
    await page.goto("/anfrage");
    await fillValid(page);
    await page.getByLabel("E-Mail").fill("kaputt");
    await page.getByLabel("Nachricht").fill("Bitte um Muster.");
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByText(/gültige E-Mail-Adresse/)).toBeVisible();
  });

  test("server-side error keeps every value (Review Focus 2)", async ({
    page,
  }) => {
    await page.goto("/anfrage");
    await page.getByLabel("Bestellnummer").fill("00000");
    await fillValid(page);
    await page.getByLabel("Firma (optional)").fill("Muster GmbH");
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByText(/nicht im Katalog/)).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("Erika Muster");
    await expect(page.getByLabel("Firma (optional)")).toHaveValue(
      "Muster GmbH"
    );
    await expect(page.getByLabel("Bestellnummer")).toHaveValue("00000");
    await expect(page.getByRole("checkbox")).toBeChecked();
  });

  test("product page call to action opens the prefilled form (SC-13)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await page.getByRole("link", { name: "Anfrage stellen" }).click();
    await expect(page).toHaveURL(/\/anfrage\?bestellnummer=99010%20-%201$/);
    await expect(page.getByLabel("Bestellnummer")).toHaveValue("99010 - 1");
  });
});

test.describe("inquiry without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("valid submit shows the result panel (SC-11)", async ({ page }) => {
    await page.goto("/anfrage?bestellnummer=99010%20-%201");
    await fillValid(page);
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByRole("status")).toContainText("nicht versendet");
  });
});
```

Seed check: the default colour of product 1 is suffix `1` (`99010 - 1`), as asserted in `e2e/catalog.spec.ts`.

- [ ] **Step 2: Extend noindex and accessibility specs**

In `e2e/noindex.spec.ts` add `"/qualitaet"` and `"/anfrage"` to the meta-robots path list and to the `X-Robots-Tag` URL list. The demo banner spec (`e2e/demo-banner.spec.ts`) — add both paths to its page list if it iterates over paths; otherwise add one test there that visits both and expects the banner region `Hinweis zur Vorschau`.

In `e2e/a11y.spec.ts` add `"/qualitaet"` and `"/anfrage?bestellnummer=99010%20-%201"` to `PAGES`, and add:

```ts
test("no serious or critical axe violations on the form with errors (SC-14)", async ({
  page,
}) => {
  await page.goto("/anfrage");
  await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
  await expect(page.getByText(/Namen/).first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
    );
  expect(blocking).toEqual([]);
});
```

- [ ] **Step 3: Run the E2E suite**

Run:

```bash
pnpm db:start && pnpm db:reset
export NEXT_PUBLIC_SUPABASE_URL="$(pnpm exec supabase status -o json | jq -r .API_URL)"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(pnpm exec supabase status -o json | jq -r .PUBLISHABLE_KEY)"
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
pnpm build && pnpm e2e
```

Expected: all specs PASS. Fix failures in the owning code, not by weakening assertions.

- [ ] **Step 4: Docs**

- `docs/roadmap.md`: in "Fixed decisions" extend the `Inquiry` row: "order number checked via `find_variant`; imprint and privacy are links to the operator's pages; certificates via `pnpm certificates:import`". Status of feature 5 stays `in progress` (set to `done` only after Gate 2 approval).
- `docs/specs/2026-10-09-content-inquiry-design.md`: status `implemented (2026-10-09)`; if the implementation deviated anywhere (for example the `slugify` output or Zod API details), note it in the relevant decision.

Run: `pnpm exec prettier --check docs`
Expected: exit 0.

- [ ] **Step 5: Full verification**

Run each and record the exit code:

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm test; echo "test exit $?"
pnpm build; echo "build exit $?"
pnpm db:test; echo "db:test exit $?"
pnpm e2e; echo "e2e exit $?"
```

Expected: every exit code 0.

- [ ] **Step 6: Commit**

```bash
git add e2e/ docs/
git commit -m "test(e2e): content pages and inquiry flow"
```

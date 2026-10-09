# Feature 3 — Import & removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command loads the legacy catalog (Mongo snapshot + CDN images) into Supabase — complete and cross-checked, or not at all — and one command removes it again.

**Architecture:** A Node CLI (`scripts/import/`, run with Node's built-in type stripping) validates a local JSON snapshot with Zod, maps it with pure functions into a flat JSON payload plus a list of findings, downloads and uploads images to Storage, then calls `public.import_catalog(jsonb)` once. That Postgres function upserts by natural keys, rewrites children, deletes stale imported rows and runs the cross-checks in one transaction. A Markdown report next to the snapshot lists everything that could not be mapped. `public.remove_catalog()` plus `storage.emptyBucket` reverse it.

**Tech Stack:** Node 22 (type stripping), TypeScript strict, Zod 4, `@supabase/supabase-js` 2.117, `image-size` 2, PostgreSQL 17 + pgTAP, Supabase CLI 2.119, Vitest 5, pnpm 10.

**Spec:** [`docs/specs/2026-10-09-import-removal-design.md`](../specs/2026-10-09-import-removal-design.md) · Data model: [`docs/data-model.md`](../data-model.md)

## Global Constraints

- TypeScript `strict: true`; no `any`, no non-null assertions (`!`) — narrow explicitly. No casts in production code except where a comment explains why.
- Code, identifiers, comments, commit messages, docs: English. Report text and generated content: German where it is catalog content, English for the report structure.
- Conventional Commits; WIP commits on branch `feat/import-removal` are allowed. **No push, no PR, no merge to `main` (Gate 2).**
- Never commit customer data: no snapshot files, no reports, no real images, no CDN cloud name. Fixtures are invented: product ids `9001+`, article numbers `98xxx` (the seed uses `99xxx`), colour names prefixed `test`.
- Script modules under `scripts/import/` use the `.mts` extension, relative imports with explicit `.mts` extension, `import type` for type-only imports, no `enum`/`namespace`/parameter properties, no `@/` alias. They must not import runtime code from `lib/**/*.ts` (Node warns about typeless `.ts` modules); type-only imports from `lib/` are fine.
- Unit tests live in `tests/import/*.test.ts`, start with `// @vitest-environment node`, and import scripts by relative path with the `.mts` extension.
- Integration tests live in `tests/integration/` and run with `pnpm db:test` against the local stack (`pnpm db:start` first).
- Package manager: pnpm. Supabase CLI only via `pnpm exec supabase …`.
- Schema changes: new migration file, then `pnpm exec supabase db reset`, then `pnpm db:types` (CI fails on type drift).
- Every new SQL function: `set search_path = ''`, fully qualified names, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`.
- Env names (exact): `IMPORT_SUPABASE_URL`, `IMPORT_SUPABASE_SECRET_KEY`, `IMPORT_IMAGE_BASE_URL`. Never print key values.
- pnpm scripts (exact): `catalog:import`, `catalog:remove`.
- Storage bucket `catalog`; import paths `products/{category-slug}/{product-slug}/{file}`.
- TDD: for every task, the **test-writer** agent writes the failing tests from this plan (step 1), the implementer makes them pass. Tests are never loosened to make them pass; report instead.
- `.env*` files may be unreadable (permission rule). Do not try to read or edit `.env.example` in this feature.
- If a hook blocks a command, stop and report — never work around it.

## Review Focus

1. **Whitespace noise in legacy text** (double spaces, non-breaking spaces, trailing blanks) must not defeat attribute, material or colour rules — `cleanText` normalises before matching. Pinned in Task 3 (`"Höhe 8  mm "`).
2. **Empty strings instead of null** in Mongo fields must behave like missing values (no empty subtitle, no empty note, no empty packaging). Pinned in Tasks 1 and 4.
3. **Image references with umlauts, spaces or URL encoding** must yield ASCII storage paths and a correctly encoded download URL. Pinned in Task 6.
4. **Re-run after a failed run** (images uploaded, RPC rejected) must succeed and leave no orphaned objects. Pinned in Task 11.
5. **Removal confirmation given in the wrong form** (full URL, other host, missing) must refuse and change nothing. Pinned in Task 12.

## File Structure

```
scripts/import/result.mts          Result helper (copy of lib/result.ts semantics, see constraints)
scripts/import/snapshot.mts        Zod schemas, parseSnapshot(), readSnapshot()
scripts/import/payload.mts         ImportPayload and row types (flat arrays)
scripts/import/findings.mts        Finding union, MapError
scripts/import/categories.mts      the 5 categories
scripts/import/map/text.mts        cleanText, cleanBlock, slugify, parseDecimal
scripts/import/map/materials.mts   MATERIALS, splitMaterial()
scripts/import/map/products.mts    mapProducts() incl. slug collisions
scripts/import/map/attributes.mts  ATTRIBUTES, parseFragment()
scripts/import/map/articles.mts    mapArticles() incl. packaging, shared articles
scripts/import/map/colors.mts      COLOR_FAMILIES, splitColorName(), mapColors()
scripts/import/map/media.mts       resolveImageUrl(), normaliseFileName(), mapMedia()
scripts/import/map/index.mts       mapSnapshot(), completePayload()
scripts/import/report.mts          renderReport(), writeReport()
scripts/import/env.mts             parseImportEnv(), parseRemoveEnv()
scripts/import/images.mts          fetchImages(), uploadImages(), listObjects(), deleteOrphans()
scripts/import/cli.mts             runImportCli() — pnpm catalog:import
scripts/import/remove.mts          runRemoveCli() — pnpm catalog:remove
supabase/migrations/20261009090000_import_functions.sql
supabase/tests/06_import.test.sql
tests/import/*.test.ts             unit tests
tests/import/factory.ts            in-memory snapshot builders for unit tests
tests/import/png.ts                makePng(width, height) — synthetic image bytes
tests/integration/import-helpers.ts  image server, fixture copy, db reset, service client
tests/integration/import.test.ts
tests/integration/remove.test.ts
tests/fixtures/import/snapshot/*.json  synthetic snapshot
config/branding.ts                 + placeholderBranding
docs/import.md, docs/revocation.md
```

## Preparation (orchestrator, before Task 1)

- [ ] Spec and plan are untracked on `main`. Create the worktree/branch `feat/import-removal` (EnterWorktree), copy `docs/specs/2026-10-09-import-removal-design.md`, `docs/plans/2026-10-09-import-removal.md` and the roadmap change into it, commit them there: `docs: spec and plan for feature 3 (import & removal)`.
- [ ] In the worktree: `pnpm install`, `pnpm exec next typegen`, `pnpm db:start` (stack may already run from the main checkout — it is shared; that is fine), `pnpm typecheck && pnpm test` green as baseline.

---

### Task 1: Result helper, text helpers and snapshot reader (FR-2)

**Files:**
- Create: `scripts/import/result.mts`, `scripts/import/map/text.mts`, `scripts/import/snapshot.mts`
- Test: `tests/import/text.test.ts`, `tests/import/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `type Result<T, E>`, `ok(value)`, `err(error)` (same shape as `lib/result.ts`)
  - `cleanText(value: string | null | undefined): string | null`
  - `cleanBlock(value: string | null | undefined): string | null`
  - `slugify(value: string): string`
  - `parseDecimal(raw: string): number`
  - `SNAPSHOT_FILES`, `type Snapshot = { products: SnapshotProduct[]; articles: SnapshotArticle[]; colors: SnapshotColor[]; product_colors_connection: SnapshotProductColor[] }`
  - `type SnapshotProduct = { product_id: number; prio: number; category: string; name: string; description1..4?: string | null; material?: string | null; imageUrls_small: string[]; imageUrls_big: string[] }`
  - `type SnapshotArticle = { product_id: number; number: string; prio: number; name: string; description1..4?: string | null; vpe1..4: string | null }`
  - `type SnapshotColor = { color_id: string; name: string; code: string }`
  - `type SnapshotProductColor = { product_id: number; color_id: string; color_suffix: number }`
  - `type SnapshotError = { kind: "snapshot_invalid"; message: string }`
  - `parseSnapshot(raw: Record<SnapshotFile, unknown>): Result<Snapshot, SnapshotError>`
  - `readSnapshot(dir: string): Promise<Result<Snapshot, SnapshotError>>`

- [ ] **Step 1: Write the failing tests**

`tests/import/text.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanBlock,
  cleanText,
  parseDecimal,
  slugify,
} from "../../scripts/import/map/text.mts";

describe("cleanText", () => {
  it("trims and collapses whitespace including non-breaking spaces", () => {
    expect(cleanText("  Höhe 8   mm ")).toBe("Höhe 8 mm");
  });
  it("maps empty, blank and missing values to null", () => {
    expect(cleanText("")).toBeNull();
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});

describe("cleanBlock", () => {
  it("keeps line breaks but trims lines and drops blank ones", () => {
    expect(cleanBlock(" Erste Zeile \n\n  Zweite Zeile ")).toBe(
      "Erste Zeile\nZweite Zeile"
    );
  });
  it("maps blank values to null", () => {
    expect(cleanBlock(" \n ")).toBeNull();
  });
});

describe("slugify", () => {
  it("transliterates German characters", () => {
    expect(slugify("Schließkeile mit Dämpfung")).toBe(
      "schliesskeile-mit-daempfung"
    );
    expect(slugify("Übergänge für Öffnungen")).toBe(
      "uebergaenge-fuer-oeffnungen"
    );
  });
  it("drops symbols and collapses separators", () => {
    expect(slugify("Wandhalter für Rohr Ø 15 mm (2-fach)")).toBe(
      "wandhalter-fuer-rohr-15-mm-2-fach"
    );
    expect(slugify("a_6010 Schließkeil")).toBe("a-6010-schliesskeil");
  });
  it("returns an empty string when nothing is left", () => {
    expect(slugify("Ø °")).toBe("");
  });
});

describe("parseDecimal", () => {
  it("accepts comma and point as decimal separator", () => {
    expect(parseDecimal("15,5")).toBe(15.5);
    expect(parseDecimal("9.5")).toBe(9.5);
    expect(parseDecimal("8")).toBe(8);
  });
});
```

`tests/import/snapshot.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSnapshot, readSnapshot } from "../../scripts/import/snapshot.mts";

const valid = {
  products: [
    {
      _id: { $oid: "000000000000000000000001" },
      product_id: 9001,
      prio: 10000,
      category: "moebel",
      name: "Testkeil",
      description1: "für Testschlösser",
      description2: "",
      description3: null,
      material: "PA-6",
      imageUrls_small: ["/a_98010-Testkeil.webp"],
      imageUrls_big: [],
      createdAt: { $date: "2024-11-23T00:00:00.000Z" },
    },
  ],
  articles: [
    {
      product_id: 9001,
      number: "98010",
      prio: 10000,
      name: "Testkeil",
      description1: "Höhe 8 mm",
      vpe1: "500",
      vpe2: 100,
      vpe3: null,
    },
  ],
  colors: [{ color_id: "1-1", name: "testweiß", code: "#F2F5F3" }],
  product_colors_connection: [
    { product_id: 9001, color_id: "1-1", color_suffix: 0 },
  ],
};

describe("parseSnapshot (FR-2, SC-2)", () => {
  it("parses a valid snapshot and normalises optional fields", () => {
    const result = parseSnapshot(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products[0].imageUrls_big).toEqual([]);
    expect(result.value.articles[0].vpe1).toBe("500");
    expect(result.value.articles[0].vpe2).toBe("100");
    expect(result.value.articles[0].vpe3).toBeNull();
    expect(result.value.articles[0].vpe4).toBeNull();
  });

  it("treats missing image arrays as empty", () => {
    const { imageUrls_small: _s, imageUrls_big: _b, ...bare } =
      valid.products[0];
    const result = parseSnapshot({ ...valid, products: [bare] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.products[0].imageUrls_small).toEqual([]);
  });

  it("rejects an empty collection with the file name", () => {
    const result = parseSnapshot({ ...valid, articles: [] });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "snapshot_invalid",
        message: "articles.json contains no entries",
      },
    });
  });

  it("rejects a wrong type with file name and path", () => {
    const result = parseSnapshot({
      ...valid,
      products: [{ ...valid.products[0], product_id: "9001" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("products.json");
      expect(result.error.message).toContain("0.product_id");
    }
  });

  it("rejects an unknown shape", () => {
    const result = parseSnapshot({ ...valid, colors: [{ foo: "bar" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("colors.json");
  });

  it("rejects a collection that is not an array", () => {
    const result = parseSnapshot({ ...valid, colors: { color_id: "1-1" } });
    expect(result.ok).toBe(false);
  });
});

describe("readSnapshot (FR-2, SC-2)", () => {
  async function writeSnapshot(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "snapshot-"));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content);
    }
    return dir;
  }

  it("reads the four files", async () => {
    const dir = await writeSnapshot(
      Object.fromEntries(
        Object.entries(valid).map(([name, rows]) => [
          `${name}.json`,
          JSON.stringify(rows),
        ])
      )
    );
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
  });

  it("names a missing file", async () => {
    const dir = await writeSnapshot({
      "products.json": JSON.stringify(valid.products),
      "articles.json": JSON.stringify(valid.articles),
      "colors.json": JSON.stringify(valid.colors),
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain(
        "product_colors_connection.json is missing"
      );
  });

  it("names a file with invalid JSON", async () => {
    const dir = await writeSnapshot({
      "products.json": "{not json",
      "articles.json": "[]",
      "colors.json": "[]",
      "product_colors_connection.json": "[]",
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain("products.json is not valid JSON");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/import/text.test.ts tests/import/snapshot.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`scripts/import/result.mts`:

```ts
// Same shape as lib/result.ts. Duplicated because the import scripts run on
// plain Node, which warns when loading the typeless `.ts` modules in lib/.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T,>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E,>(error: E): Result<never, E> => ({ ok: false, error });
```

`scripts/import/map/text.mts`:

```ts
const GERMAN: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  ß: "ss",
};

/** Trims and collapses all whitespace (incl. non-breaking spaces); blank → null. */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/** Like cleanText, but keeps line breaks between non-blank lines. */
export function cleanBlock(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter((line): line is string => line !== null);
  return lines.length === 0 ? null : lines.join("\n");
}

export function slugify(value: string): string {
  return value
    .replace(/[äöüÄÖÜß]/g, (char) => GERMAN[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseDecimal(raw: string): number {
  return Number(raw.replace(",", "."));
}
```

`scripts/import/snapshot.mts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "./result.mts";

// Shapes follow the old admin app's Prisma schema as exported by
// `mongoexport --jsonArray` (relaxed extended JSON). Unknown fields such as
// `_id` or `createdAt` are ignored.
const optionalText = z.string().nullish();
const stringList = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);
const packaging = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) =>
    value === null || value === undefined ? null : String(value)
  );

const productSchema = z.object({
  product_id: z.number().int(),
  prio: z.number().int(),
  category: z.string(),
  name: z.string(),
  description1: optionalText,
  description2: optionalText,
  description3: optionalText,
  description4: optionalText,
  material: optionalText,
  imageUrls_small: stringList,
  imageUrls_big: stringList,
});

const articleSchema = z.object({
  product_id: z.number().int(),
  number: z.string(),
  prio: z.number().int(),
  name: z.string(),
  description1: optionalText,
  description2: optionalText,
  description3: optionalText,
  description4: optionalText,
  vpe1: packaging,
  vpe2: packaging,
  vpe3: packaging,
  vpe4: packaging,
});

const colorSchema = z.object({
  color_id: z.string(),
  name: z.string(),
  code: z.string(),
});

const productColorSchema = z.object({
  product_id: z.number().int(),
  color_id: z.string(),
  color_suffix: z.number().int(),
});

const schemas = {
  products: z.array(productSchema),
  articles: z.array(articleSchema),
  colors: z.array(colorSchema),
  product_colors_connection: z.array(productColorSchema),
} as const;

export const SNAPSHOT_FILES = [
  "products",
  "articles",
  "colors",
  "product_colors_connection",
] as const;
export type SnapshotFile = (typeof SNAPSHOT_FILES)[number];

export type SnapshotProduct = z.infer<typeof productSchema>;
export type SnapshotArticle = z.infer<typeof articleSchema>;
export type SnapshotColor = z.infer<typeof colorSchema>;
export type SnapshotProductColor = z.infer<typeof productColorSchema>;
export type Snapshot = {
  products: SnapshotProduct[];
  articles: SnapshotArticle[];
  colors: SnapshotColor[];
  product_colors_connection: SnapshotProductColor[];
};
export type SnapshotError = { kind: "snapshot_invalid"; message: string };

const invalid = (message: string): Result<never, SnapshotError> =>
  err({ kind: "snapshot_invalid", message });

function parseFile<S extends z.ZodType<unknown[]>>(
  file: SnapshotFile,
  schema: S,
  raw: unknown
): Result<z.infer<S>, SnapshotError> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return invalid(`${file}.json: ${details}`);
  }
  if (result.data.length === 0) return invalid(`${file}.json contains no entries`);
  return ok(result.data);
}

export function parseSnapshot(
  raw: Record<SnapshotFile, unknown>
): Result<Snapshot, SnapshotError> {
  const products = parseFile("products", schemas.products, raw.products);
  if (!products.ok) return products;
  const articles = parseFile("articles", schemas.articles, raw.articles);
  if (!articles.ok) return articles;
  const colors = parseFile("colors", schemas.colors, raw.colors);
  if (!colors.ok) return colors;
  const links = parseFile(
    "product_colors_connection",
    schemas.product_colors_connection,
    raw.product_colors_connection
  );
  if (!links.ok) return links;
  return ok({
    products: products.value,
    articles: articles.value,
    colors: colors.value,
    product_colors_connection: links.value,
  });
}

export async function readSnapshot(
  dir: string
): Promise<Result<Snapshot, SnapshotError>> {
  const raw: Partial<Record<SnapshotFile, unknown>> = {};
  for (const file of SNAPSHOT_FILES) {
    let text: string;
    try {
      text = await readFile(join(dir, `${file}.json`), "utf8");
    } catch {
      return invalid(`${file}.json is missing in ${dir}`);
    }
    try {
      raw[file] = JSON.parse(text);
    } catch {
      return invalid(`${file}.json is not valid JSON`);
    }
  }
  return parseSnapshot({
    products: raw.products,
    articles: raw.articles,
    colors: raw.colors,
    product_colors_connection: raw.product_colors_connection,
  });
}
```

Note: if `z.ZodType<unknown[]>` does not accept the array schemas in Zod 4 typing, use `S extends z.ZodArray<z.ZodType>` — keep the function generic, no casts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/import/text.test.ts tests/import/snapshot.test.ts && pnpm typecheck`
Expected: PASS, typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/import tests/import
git commit -m "feat(import): snapshot reader and text helpers"
```

---

### Task 2: Payload types, categories, materials and product mapping (FR-3, FR-5)

**Files:**
- Create: `scripts/import/payload.mts`, `scripts/import/findings.mts`, `scripts/import/categories.mts`, `scripts/import/map/materials.mts`, `scripts/import/map/products.mts`, `tests/import/factory.ts`
- Test: `tests/import/materials.test.ts`, `tests/import/products.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Result`, `cleanText`, `cleanBlock`, `slugify`, `SnapshotProduct`, …)
- Produces:

`scripts/import/payload.mts` (complete file):

```ts
// Flat JSON payload for public.import_catalog(jsonb). Every array maps to one
// jsonb_to_recordset() call in the migration; field names are column names.
export type PayloadCategory = { slug: string; name: string; sort_order: number };
export type PayloadMaterial = { code: string; name: string };
export type PayloadAttribute = {
  key: string;
  label: string;
  unit: string | null;
  data_type: "decimal" | "text";
  sort_order: number;
};
export type PayloadCategoryAttribute = {
  category_slug: string;
  attribute_key: string;
  sort_order: number;
};
export type PayloadColor = {
  name: string;
  ral_reference: string | null;
  hex_code: string;
  family: string;
};
export type PayloadMedia = {
  storage_path: string;
  width: number;
  height: number;
  alt_text: string;
};
export type PayloadProduct = {
  legacy_product_id: number;
  category_slug: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  material_code: string | null;
  material_note: string | null;
  sort_order: number;
};
export type PayloadArticle = {
  article_number: string;
  legacy_product_id: number;
  name: string | null;
  description: string | null;
  note: string | null;
  sort_order: number;
};
export type PayloadArticleAttribute = {
  article_number: string;
  key: string;
  value_decimal: number | null;
  value_text: string | null;
};
export type PayloadArticlePackaging = {
  article_number: string;
  quantity: number;
  sort_order: number;
};
export type PayloadProductColor = {
  legacy_product_id: number;
  color_name: string;
  color_hex: string;
  suffix: string | null;
  is_default: boolean;
  sort_order: number;
};
export type PayloadProductMedia = {
  legacy_product_id: number;
  storage_path: string;
  role: "thumbnail" | "gallery";
  sort_order: number;
};
export type PayloadProductAccessory = {
  legacy_product_id: number;
  article_number: string;
  sort_order: number;
};

export type ImportPayload = {
  categories: PayloadCategory[];
  materials: PayloadMaterial[];
  attributes: PayloadAttribute[];
  category_attributes: PayloadCategoryAttribute[];
  colors: PayloadColor[];
  media: PayloadMedia[];
  products: PayloadProduct[];
  articles: PayloadArticle[];
  article_attributes: PayloadArticleAttribute[];
  article_packaging: PayloadArticlePackaging[];
  product_colors: PayloadProductColor[];
  product_media: PayloadProductMedia[];
  product_accessories: PayloadProductAccessory[];
};
```

`scripts/import/findings.mts` (complete file):

```ts
export type Finding =
  | { kind: "failed_image"; url: string; storagePath: string; reason: string }
  | { kind: "unparsed_attribute"; articleNumber: string; text: string }
  | {
      kind: "partial_attribute";
      articleNumber: string;
      text: string;
      remainder: string;
    }
  | { kind: "material_fallback"; legacyProductId: number; text: string }
  | { kind: "default_color_by_rule"; legacyProductId: number; suffix: string }
  | { kind: "merged_color"; name: string; hex: string; legacyColorIds: string[] }
  | {
      kind: "shared_article";
      articleNumber: string;
      homeLegacyProductId: number;
      accessoryLegacyProductIds: number[];
    }
  | {
      kind: "slug_collision";
      legacyProductId: number;
      slug: string;
      level: "subtitle" | "legacy_id";
    }
  | { kind: "skipped_image"; legacyProductId: number; reference: string }
  | { kind: "packaging_note"; articleNumber: string; text: string }
  | { kind: "alt_text_review"; storagePath: string };

export type MapError = { kind: "invalid_data"; message: string };
```

- `CATEGORIES: readonly PayloadCategory[]` — `moebel`/Möbel/0, `halterung`/Halterungen/1, `wasser`/Wasser/2, `lueftung`/Lüftungen/3, `elektro`/Elektro/4.
- `MATERIALS: readonly PayloadMaterial[]`, `type MaterialSplit = { code: string | null; note: string | null; fallback: boolean }`, `splitMaterial(raw: string | null | undefined): MaterialSplit`
- `mapProducts(input: readonly SnapshotProduct[]): Result<{ products: PayloadProduct[]; findings: Finding[] }, MapError>`
- `tests/import/factory.ts`: `product(overrides?)`, `article(overrides?)`, `color(overrides?)`, `link(overrides?)`, `snapshot(overrides?)` returning fully valid snapshot rows.

- [ ] **Step 1: Write the failing tests**

`tests/import/factory.ts`:

```ts
import type {
  Snapshot,
  SnapshotArticle,
  SnapshotColor,
  SnapshotProduct,
  SnapshotProductColor,
} from "../../scripts/import/snapshot.mts";

export function product(overrides: Partial<SnapshotProduct> = {}): SnapshotProduct {
  return {
    product_id: 9001,
    prio: 10000,
    category: "moebel",
    name: "Testkeil mit Dämpfung",
    description1: "für Testschlösser",
    description2: "Gedämpfter Testkeil.",
    description3: null,
    description4: null,
    material: "PA-6",
    imageUrls_small: ["/a_98010-Testkeil.webp"],
    imageUrls_big: ["/b1_98010-Testkeil.webp"],
    ...overrides,
  };
}

export function article(overrides: Partial<SnapshotArticle> = {}): SnapshotArticle {
  return {
    product_id: 9001,
    number: "98010",
    prio: 10000,
    name: "Testkeil mit Dämpfung",
    description1: "Höhe 8 mm",
    description2: null,
    description3: null,
    description4: null,
    vpe1: "500",
    vpe2: null,
    vpe3: null,
    vpe4: null,
    ...overrides,
  };
}

export function color(overrides: Partial<SnapshotColor> = {}): SnapshotColor {
  return { color_id: "1-1", name: "testweiß (ähnlich RAL 9016)", code: "#F2F5F3", ...overrides };
}

export function link(
  overrides: Partial<SnapshotProductColor> = {}
): SnapshotProductColor {
  return { product_id: 9001, color_id: "1-1", color_suffix: 0, ...overrides };
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    products: [product()],
    articles: [article()],
    colors: [color()],
    product_colors_connection: [link()],
    ...overrides,
  };
}
```

`tests/import/materials.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { splitMaterial } from "../../scripts/import/map/materials.mts";

describe("splitMaterial (FR-5, SC-5)", () => {
  it("maps a known code alone", () => {
    expect(splitMaterial("PA-6")).toEqual({ code: "PA-6", note: null, fallback: false });
    expect(splitMaterial("PC-ABS")).toEqual({ code: "PC-ABS", note: null, fallback: false });
  });
  it("maps CODE (qualifier)", () => {
    expect(splitMaterial("PA-6 (temperaturbeständig bis 100° C)")).toEqual({
      code: "PA-6",
      note: "temperaturbeständig bis 100° C",
      fallback: false,
    });
  });
  it("maps CODE qualifier", () => {
    expect(splitMaterial("PA-6 glasfaserverstärkt")).toEqual({
      code: "PA-6",
      note: "glasfaserverstärkt",
      fallback: false,
    });
  });
  it("normalises whitespace before matching", () => {
    expect(splitMaterial("  PP  glasfaserverstärkt ")).toEqual({
      code: "PP",
      note: "glasfaserverstärkt",
      fallback: false,
    });
  });
  it("falls back for several materials", () => {
    for (const text of [
      "PA-6 / ASA",
      "Wandteile: PA-6 / Blendenteile: ABS",
      "Topf: PA-6 Dämpfer: TPE",
      "Art.-Nr. 98108 (ABS) / Art.-Nr. 98148 (PP)",
    ]) {
      expect(splitMaterial(text)).toEqual({ code: null, note: text, fallback: true });
    }
  });
  it("falls back for an unknown code", () => {
    expect(splitMaterial("PEEK")).toEqual({ code: null, note: "PEEK", fallback: true });
  });
  it("yields nothing for an empty value", () => {
    expect(splitMaterial("")).toEqual({ code: null, note: null, fallback: false });
    expect(splitMaterial(null)).toEqual({ code: null, note: null, fallback: false });
  });
});
```

`tests/import/products.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapProducts } from "../../scripts/import/map/products.mts";
import { product } from "./factory";

describe("mapProducts (FR-3, SC-3)", () => {
  it("maps a product", () => {
    const result = mapProducts([
      product({
        description2: " Erster Absatz. ",
        description3: "",
        description4: "Zweiter Absatz.",
        material: "PA-6 (temperaturbeständig bis 100° C)",
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        products: [
          {
            legacy_product_id: 9001,
            category_slug: "moebel",
            slug: "testkeil-mit-daempfung",
            name: "Testkeil mit Dämpfung",
            subtitle: "für Testschlösser",
            description: "Erster Absatz.\n\nZweiter Absatz.",
            material_code: "PA-6",
            material_note: "temperaturbeständig bis 100° C",
            sort_order: 10000,
          },
        ],
        findings: [],
      },
    });
  });

  it("maps empty texts to null", () => {
    const result = mapProducts([
      product({ description1: "", description2: " ", material: "" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products[0]).toMatchObject({
      subtitle: null,
      description: null,
      material_code: null,
      material_note: null,
    });
  });

  it("reports a material fallback", () => {
    const result = mapProducts([product({ material: "Wandteil: PA-6 / Blende: ABS" })]);
    expect(result.ok && result.value.findings).toEqual([
      { kind: "material_fallback", legacyProductId: 9001, text: "Wandteil: PA-6 / Blende: ABS" },
    ]);
  });

  it("resolves a name collision with the subtitle", () => {
    const result = mapProducts([
      product({ product_id: 9001, name: "Testträger", description1: "für 16 mm" }),
      product({ product_id: 9002, name: "Testträger", description1: "für 19 mm" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products.map((p) => p.slug)).toEqual([
      "testtraeger-fuer-16-mm",
      "testtraeger-fuer-19-mm",
    ]);
    expect(result.value.findings).toEqual([
      { kind: "slug_collision", legacyProductId: 9001, slug: "testtraeger-fuer-16-mm", level: "subtitle" },
      { kind: "slug_collision", legacyProductId: 9002, slug: "testtraeger-fuer-19-mm", level: "subtitle" },
    ]);
  });

  it("falls back to the legacy id when subtitles collide or are missing", () => {
    const result = mapProducts([
      product({ product_id: 9001, name: "Testgitter", description1: "weiß" }),
      product({ product_id: 9002, name: "Testgitter", description1: "weiß" }),
      product({ product_id: 9003, name: "Testgitter", description1: null }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products.map((p) => p.slug)).toEqual([
      "testgitter-9001",
      "testgitter-9002",
      "testgitter-9003",
    ]);
    expect(result.value.findings.every((f) => f.kind === "slug_collision" && f.level === "legacy_id")).toBe(true);
  });

  it("allows the same slug in different categories", () => {
    const result = mapProducts([
      product({ product_id: 9001, name: "Testabdeckung", category: "moebel" }),
      product({ product_id: 9002, name: "Testabdeckung", category: "elektro" }),
    ]);
    expect(result.ok && result.value.findings).toEqual([]);
  });

  it("rejects an unknown category", () => {
    const result = mapProducts([product({ category: "garten" })]);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_data", message: 'product 9001 has unknown category "garten"' },
    });
  });

  it("rejects a duplicate product id", () => {
    const result = mapProducts([product(), product()]);
    expect(result.ok).toBe(false);
  });

  it("rejects a product whose name yields no slug", () => {
    const result = mapProducts([product({ name: "Ø" })]);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/import/materials.test.ts tests/import/products.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `payload.mts` and `findings.mts` exactly as in **Interfaces**.

`scripts/import/categories.mts`:

```ts
import type { PayloadCategory } from "./payload.mts";

// Legacy category slugs are kept as URL segments (/produkte/moebel). Intro
// texts are written in feature 4; the importer never touches them.
export const CATEGORIES: readonly PayloadCategory[] = [
  { slug: "moebel", name: "Möbel", sort_order: 0 },
  { slug: "halterung", name: "Halterungen", sort_order: 1 },
  { slug: "wasser", name: "Wasser", sort_order: 2 },
  { slug: "lueftung", name: "Lüftungen", sort_order: 3 },
  { slug: "elektro", name: "Elektro", sort_order: 4 },
];
```

`scripts/import/map/materials.mts`:

```ts
import type { PayloadMaterial } from "../payload.mts";
import { cleanText } from "./text.mts";

export const MATERIALS: readonly PayloadMaterial[] = [
  { code: "PA-6", name: "Polyamid 6" },
  { code: "PP", name: "Polypropylen" },
  { code: "ABS", name: "Acrylnitril-Butadien-Styrol" },
  { code: "POM", name: "Polyoxymethylen" },
  { code: "TPE", name: "Thermoplastisches Elastomer" },
  { code: "HMD-PE", name: "Polyethylen (HMD-PE)" },
  { code: "LD-PE", name: "Polyethylen niedriger Dichte" },
  { code: "PC-ABS", name: "Polycarbonat/ABS-Blend" },
  { code: "ASA", name: "Acrylnitril-Styrol-Acrylat" },
  { code: "PBT", name: "Polybutylenterephthalat" },
];

export type MaterialSplit = {
  code: string | null;
  note: string | null;
  fallback: boolean;
};

// Longest first, so "PC-ABS" wins over "ABS".
const CODES = MATERIALS.map((m) => m.code).sort((a, b) => b.length - a.length);

function mentionsCode(text: string, code: string): boolean {
  // Codes contain only [A-Z0-9-], so no escaping is needed.
  return new RegExp(`(^|[^A-Za-z0-9-])${code}([^A-Za-z0-9-]|$)`).test(text);
}

/** Splits legacy material text into a known code and a qualifier; never guesses. */
export function splitMaterial(raw: string | null | undefined): MaterialSplit {
  const text = cleanText(raw);
  if (text === null) return { code: null, note: null, fallback: false };
  const fallback: MaterialSplit = { code: null, note: text, fallback: true };

  const code = CODES.find((c) => text === c || text.startsWith(`${c} `));
  if (code === undefined) return fallback;

  let rest = text.slice(code.length).trim();
  if (rest === "") return { code, note: null, fallback: false };
  const bracketed = /^\((.*)\)$/.exec(rest);
  if (bracketed) rest = bracketed[1].trim();

  const otherCode = CODES.some((c) => c !== code && mentionsCode(rest, c));
  if (rest === "" || /[/:]/.test(rest) || otherCode) return fallback;
  return { code, note: rest, fallback: false };
}
```

`scripts/import/map/products.mts`:

```ts
import { CATEGORIES } from "../categories.mts";
import type { Finding, MapError } from "../findings.mts";
import type { PayloadProduct } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotProduct } from "../snapshot.mts";
import { splitMaterial } from "./materials.mts";
import { cleanBlock, cleanText, slugify } from "./text.mts";

type Draft = PayloadProduct & { level: "subtitle" | "legacy_id" | null };

const invalid = (message: string): Result<never, MapError> =>
  err({ kind: "invalid_data", message });

function collidingKeys(drafts: readonly Draft[]): Set<string> {
  const counts = new Map<string, number>();
  for (const d of drafts) {
    const key = `${d.category_slug}/${d.slug}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
}

function resolveSlugs(drafts: Draft[]): void {
  const first = collidingKeys(drafts);
  for (const d of drafts) {
    if (!first.has(`${d.category_slug}/${d.slug}`)) continue;
    if (d.subtitle !== null) {
      d.slug = slugify(`${d.name} ${d.subtitle}`);
      d.level = "subtitle";
    } else {
      d.slug = slugify(`${d.name} ${d.legacy_product_id}`);
      d.level = "legacy_id";
    }
  }
  const second = collidingKeys(drafts);
  for (const d of drafts) {
    if (!second.has(`${d.category_slug}/${d.slug}`)) continue;
    d.slug = slugify(`${d.name} ${d.legacy_product_id}`);
    d.level = "legacy_id";
  }
}

export function mapProducts(
  input: readonly SnapshotProduct[]
): Result<{ products: PayloadProduct[]; findings: Finding[] }, MapError> {
  const known = new Set(CATEGORIES.map((c) => c.slug));
  const seen = new Set<number>();
  const findings: Finding[] = [];
  const drafts: Draft[] = [];

  for (const p of input) {
    const id = p.product_id;
    if (seen.has(id)) return invalid(`duplicate product_id ${id}`);
    seen.add(id);

    const category = cleanText(p.category);
    if (category === null || !known.has(category))
      return invalid(`product ${id} has unknown category "${p.category}"`);
    const name = cleanText(p.name);
    if (name === null) return invalid(`product ${id} has no name`);
    const slug = slugify(name);
    if (slug === "") return invalid(`product ${id}: name "${name}" yields no slug`);

    const paragraphs = [p.description2, p.description3, p.description4]
      .map(cleanBlock)
      .filter((part): part is string => part !== null);
    const material = splitMaterial(p.material);
    if (material.fallback && material.note !== null)
      findings.push({ kind: "material_fallback", legacyProductId: id, text: material.note });

    drafts.push({
      legacy_product_id: id,
      category_slug: category,
      slug,
      name,
      subtitle: cleanText(p.description1),
      description: paragraphs.length > 0 ? paragraphs.join("\n\n") : null,
      material_code: material.code,
      material_note: material.note,
      sort_order: p.prio,
      level: null,
    });
  }

  resolveSlugs(drafts);
  if (collidingKeys(drafts).size > 0)
    return invalid("product slugs are still not unique after collision handling");

  const products: PayloadProduct[] = drafts.map(({ level, ...row }) => {
    if (level !== null)
      findings.push({ kind: "slug_collision", legacyProductId: row.legacy_product_id, slug: row.slug, level });
    return row;
  });
  return ok({ products, findings });
}
```

Note: in the "maps empty texts to null" test, `material: ""` yields no fallback finding (empty is not a fallback).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/import && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/import tests/import
git commit -m "feat(import): payload types, materials and product mapping"
```

---

### Task 3: Attribute rule table and fragment parser (FR-4 part 1)

**Files:**
- Create: `scripts/import/map/attributes.mts`
- Test: `tests/import/attributes.test.ts`

**Interfaces:**
- Consumes: `cleanText`, `parseDecimal` (Task 1), `PayloadAttribute` (Task 2)
- Produces:
  - `ATTRIBUTES: readonly PayloadAttribute[]`
  - `type FragmentResult = { kind: "typed"; values: { key: string; value: number }[]; note: string | null; partial: boolean } | { kind: "sentence"; text: string } | { kind: "unparsed"; text: string }`
  - `parseFragment(raw: string): FragmentResult` — input is one description field; returns `unparsed` with the cleaned text for anything unknown.

- [ ] **Step 1: Write the failing test**

`tests/import/attributes.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ATTRIBUTES, parseFragment } from "../../scripts/import/map/attributes.mts";

const typed = (values: Record<string, number>, note: string | null = null, partial = false) => ({
  kind: "typed",
  values: Object.entries(values).map(([key, value]) => ({ key, value })),
  note,
  partial,
});

describe("parseFragment rule table (FR-4, SC-4)", () => {
  it.each([
    ["Höhe 8 mm", { height: 8 }],
    ["Höhe: 15,5 mm", { height: 15.5 }],
    ["Fußhöhe 30 mm", { foot_height: 30 }],
    ["für 16 mm Plattenstärke", { panel_thickness: 16 }],
    ["für 19 mm Platte", { panel_thickness: 19 }],
    ["für Abwasserrohre Ø 40 mm Fußhöhe 30 mm", { pipe_diameter: 40, foot_height: 30 }],
    ["für isolierte Abwasserrohre Ø 50 mm Fußhöhe 35 mm", { insulated_pipe_diameter: 50, foot_height: 35 }],
    ["für Heizungsrohre Ø 15 mm Fußhöhe 20 mm", { pipe_diameter: 15, foot_height: 20 }],
    ["für Rundrohr Ø 25 mm", { round_tube_diameter: 25 }],
    ["für Schlauch Ø 10 mm R 5 mm", { hose_diameter: 10, radius: 5 }],
    ["für Schlauch Ø 12 mm", { hose_diameter: 12 }],
    ["für Kabel Ø 8 mm", { cable_diameter: 8 }],
    ["für Leistenbreite 20 mm", { strip_width: 20 }],
    ["Tank-Bohrung 30 mm", { bore_diameter: 30 }],
    ["Höhe 8 mm und Ø 5 mm Bohrung", { height: 8, bore_diameter: 5 }],
    ["Einschubtiefe: 12 mm", { insertion_depth: 12 }],
    ["durch Stift Ø 6 mm", { pin_diameter: 6 }],
  ])("types %s", (text, values) => {
    expect(parseFragment(text)).toEqual(typed(values));
  });

  it("keeps the full text as note for pins with a length", () => {
    expect(parseFragment("Zapfen Ø 8 x 10 mm")).toEqual(
      typed({ pin_diameter: 8 }, "Zapfen Ø 8 x 10 mm")
    );
  });

  it("puts the remainder of a prefix rule into the note", () => {
    expect(parseFragment("Höhe 9,5 mm abgesetzt")).toEqual(
      typed({ height: 9.5 }, "abgesetzt", true)
    );
    expect(parseFragment("für Leistenbreite 20 mm (mit Positionierung)")).toEqual(
      typed({ strip_width: 20 }, "(mit Positionierung)", true)
    );
    expect(parseFragment("Höhe 8 mm und Ø 5 mm Bohrung (für doppelte Böden)")).toEqual(
      typed({ height: 8, bore_diameter: 5 }, "(für doppelte Böden)", true)
    );
  });

  it("normalises whitespace before matching", () => {
    expect(parseFragment("Höhe 8  mm ")).toEqual(typed({ height: 8 }));
  });

  it("does not type a bare diameter", () => {
    expect(parseFragment("Ø 12 mm")).toEqual({ kind: "unparsed", text: "Ø 12 mm" });
  });

  it("does not type whole-match rules with extra text", () => {
    expect(
      parseFragment("durch Zapfen Ø 8 mm für Fahrzeugboden und Stift Ø 6 mm für Truhenwand")
    ).toEqual({
      kind: "unparsed",
      text: "durch Zapfen Ø 8 mm für Fahrzeugboden und Stift Ø 6 mm für Truhenwand",
    });
  });

  it("does not type dimension triples or flags", () => {
    expect(parseFragment("40 x 30 x 20 mm").kind).toBe("unparsed");
    expect(parseFragment("ohne Positionierung").kind).toBe("unparsed");
  });

  it("recognises full sentences", () => {
    expect(parseFragment("Für die Montage wird ein Testwerkzeug benötigt.")).toEqual({
      kind: "sentence",
      text: "Für die Montage wird ein Testwerkzeug benötigt.",
    });
  });

  it("defines every key used by a rule exactly once", () => {
    const keys = ATTRIBUTES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining([
      "height", "foot_height", "panel_thickness", "pipe_diameter",
      "insulated_pipe_diameter", "round_tube_diameter", "hose_diameter", "radius",
      "cable_diameter", "strip_width", "bore_diameter", "insertion_depth", "pin_diameter",
    ]));
    expect(ATTRIBUTES.every((a) => a.data_type === "decimal" && a.unit === "mm")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/attributes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/map/attributes.mts`:

```ts
import type { PayloadAttribute } from "../payload.mts";
import { cleanText, parseDecimal } from "./text.mts";

const mm = (key: string, label: string, sort_order: number): PayloadAttribute => ({
  key,
  label,
  unit: "mm",
  data_type: "decimal",
  sort_order,
});

// Domain-specific keys on purpose (docs/data-model.md): "Ø" alone has many meanings.
export const ATTRIBUTES: readonly PayloadAttribute[] = [
  mm("height", "Höhe", 10),
  mm("foot_height", "Fußhöhe", 20),
  mm("panel_thickness", "Plattenstärke", 30),
  mm("pipe_diameter", "für Rohr Ø", 40),
  mm("insulated_pipe_diameter", "für isoliertes Rohr Ø", 50),
  mm("round_tube_diameter", "für Rundrohr Ø", 60),
  mm("hose_diameter", "für Schlauch Ø", 70),
  mm("radius", "Radius", 80),
  mm("cable_diameter", "für Kabel Ø", 90),
  mm("strip_width", "Leistenbreite", 100),
  mm("bore_diameter", "Bohrung Ø", 110),
  mm("insertion_depth", "Einschubtiefe", 120),
  mm("pin_diameter", "Zapfen-/Stift-Ø", 130),
];

export type FragmentResult =
  | { kind: "typed"; values: { key: string; value: number }[]; note: string | null; partial: boolean }
  | { kind: "sentence"; text: string }
  | { kind: "unparsed"; text: string };

type Rule = {
  pattern: RegExp;
  keys: readonly string[];
  /** whole: the pattern must cover the fragment; prefix: the rest becomes a note. */
  mode: "whole" | "prefix";
  /** Keeps the full fragment as note (information the keys cannot hold). */
  keepOriginal?: boolean;
};

const N = String.raw`(\d+(?:[.,]\d+)?)`;
const rule = (source: string, keys: readonly string[], mode: Rule["mode"], keepOriginal = false): Rule => ({
  pattern: new RegExp(mode === "whole" ? `^${source}$` : `^${source}`),
  keys,
  mode,
  keepOriginal,
});

// Order matters: specific rules before general ones.
const RULES: readonly Rule[] = [
  rule(`für isolierte Abwasserrohre Ø ${N} mm Fußhöhe ${N} mm`, ["insulated_pipe_diameter", "foot_height"], "whole"),
  rule(`für (?:Abwasserrohre|Heizungsrohre) Ø ${N} mm Fußhöhe ${N} mm`, ["pipe_diameter", "foot_height"], "whole"),
  rule(`Höhe ${N} mm und Ø ${N} mm Bohrung`, ["height", "bore_diameter"], "prefix"),
  rule(`Höhe:? ${N} mm`, ["height"], "prefix"),
  rule(`Fußhöhe ${N} mm`, ["foot_height"], "prefix"),
  rule(`für ${N} mm (?:Plattenstärke|Platte)`, ["panel_thickness"], "prefix"),
  rule(`für Rundrohr Ø ${N} mm`, ["round_tube_diameter"], "whole"),
  rule(`für Schlauch Ø ${N} mm R ${N} mm`, ["hose_diameter", "radius"], "whole"),
  rule(`für Schlauch Ø ${N} mm`, ["hose_diameter"], "whole"),
  rule(`für Kabel Ø ${N} mm`, ["cable_diameter"], "whole"),
  rule(`für Leistenbreite ${N} mm`, ["strip_width"], "prefix"),
  rule(`Tank-Bohrung ${N} mm`, ["bore_diameter"], "whole"),
  rule(`Einschubtiefe:? ${N} mm`, ["insertion_depth"], "whole"),
  rule(`(?:durch )?(?:Stift|Zapfen) Ø ${N} mm`, ["pin_diameter"], "whole"),
  rule(`(?:durch )?(?:Stift|Zapfen) Ø ${N} x \\d+(?:[.,]\\d+)? mm`, ["pin_diameter"], "whole", true),
];

/** Types one legacy description field, or says why it could not. Never guesses. */
export function parseFragment(raw: string): FragmentResult {
  const text = cleanText(raw) ?? "";
  for (const r of RULES) {
    const match = r.pattern.exec(text);
    if (match === null) continue;
    const values = r.keys.map((key, index) => ({ key, value: parseDecimal(match[index + 1] ?? "") }));
    if (r.keepOriginal) return { kind: "typed", values, note: text, partial: false };
    const remainder = cleanText(text.slice(match[0].length).replace(/^[\s,;:-]+/, ""));
    return { kind: "typed", values, note: remainder, partial: remainder !== null };
  }
  if (text.endsWith(".")) return { kind: "sentence", text };
  return { kind: "unparsed", text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import/attributes.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/map/attributes.mts tests/import/attributes.test.ts
git commit -m "feat(import): attribute rule table"
```

---

### Task 4: Article mapping — attributes, packaging, shared articles (FR-4 part 2)

**Files:**
- Create: `scripts/import/map/articles.mts`
- Test: `tests/import/articles.test.ts`

**Interfaces:**
- Consumes: `parseFragment` (Task 3), `PayloadProduct`, `Finding`, `MapError` (Task 2), `SnapshotArticle` (Task 1)
- Produces:
  - `type ArticleMapping = { articles: PayloadArticle[]; article_attributes: PayloadArticleAttribute[]; article_packaging: PayloadArticlePackaging[]; product_accessories: PayloadProductAccessory[]; findings: Finding[]; fragments: { total: number; typed: number } }`
  - `mapArticles(input: readonly SnapshotArticle[], products: readonly PayloadProduct[]): Result<ArticleMapping, MapError>`

Rules:
- Article number kept exactly as exported (no trimming); a blank number is invalid.
- An article referencing an unknown product is invalid (`article 98010 references unknown product 9009`).
- The same number twice in the same product is invalid.
- Shared number: home = occurrence with the lowest `product_id`; every other occurrence → `product_accessories` row `{ legacy_product_id, article_number, sort_order: prio of that occurrence }`; one `shared_article` finding per number.
- Name stored only if it differs from the home product's name (after `cleanText`).
- `description1..4` of the home occurrence are fragments, in order. `typed` → attributes (a key already set for this article makes the whole fragment unparsed); `typed.note` → note line; `partial` → `partial_attribute` finding; `sentence` → description paragraph; `unparsed` → note line + `unparsed_attribute` finding.
- `vpe1..4`: blank skipped; `^\d+$` and > 0 → packaging `{ quantity, sort_order: index 0..3 }`, duplicates of a quantity skipped; anything else → note line + `packaging_note` finding.
- `description` = paragraphs joined by `\n\n` or null; `note` = lines joined by `\n` or null; `sort_order` = home `prio`.
- Every product needs at least one home article (`product 9002 has no articles`).
- `fragments.total` counts non-blank fragments; `fragments.typed` counts fragments that produced attributes.

- [ ] **Step 1: Write the failing test**

`tests/import/articles.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapArticles } from "../../scripts/import/map/articles.mts";
import type { PayloadProduct } from "../../scripts/import/payload.mts";
import { article } from "./factory";

const productRow = (id: number, name: string): PayloadProduct => ({
  legacy_product_id: id,
  category_slug: "moebel",
  slug: `p-${id}`,
  name,
  subtitle: null,
  description: null,
  material_code: null,
  material_note: null,
  sort_order: 0,
});
const products = [productRow(9001, "Testkeil mit Dämpfung"), productRow(9003, "Testschlüssel")];

describe("mapArticles (FR-4, SC-4)", () => {
  it("maps an article with typed attributes and packaging", () => {
    const result = mapArticles(
      [
        article({ product_id: 9001, number: "98010", vpe1: "500", vpe2: "100", vpe3: "500" }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles[0]).toEqual({
      article_number: "98010",
      legacy_product_id: 9001,
      name: null,
      description: null,
      note: null,
      sort_order: 10000,
    });
    expect(result.value.article_attributes).toContainEqual({
      article_number: "98010",
      key: "height",
      value_decimal: 8,
      value_text: null,
    });
    expect(result.value.article_packaging.filter((p) => p.article_number === "98010")).toEqual([
      { article_number: "98010", quantity: 500, sort_order: 0 },
      { article_number: "98010", quantity: 100, sort_order: 1 },
    ]);
    expect(result.value.fragments).toEqual({ total: 2, typed: 2 });
  });

  it("keeps article numbers with a slash unchanged and stores differing names", () => {
    const result = mapArticles(
      [article({ number: "98011/80", name: "Testkeil hoch" }), article({ product_id: 9003, number: "98030", name: "Testschlüssel" })],
      products
    );
    expect(result.ok && result.value.articles[0]).toMatchObject({ article_number: "98011/80", name: "Testkeil hoch" });
  });

  it("routes sentences, partial matches and unknown fragments", () => {
    const result = mapArticles(
      [
        article({
          description1: "Höhe 9,5 mm abgesetzt",
          description2: "Ø 12 mm",
          description3: "Für die Montage wird ein Testwerkzeug benötigt.",
          description4: "",
        }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles[0]).toMatchObject({
      description: "Für die Montage wird ein Testwerkzeug benötigt.",
      note: "abgesetzt\nØ 12 mm",
    });
    expect(result.value.findings).toEqual(expect.arrayContaining([
      { kind: "partial_attribute", articleNumber: "98010", text: "Höhe 9,5 mm abgesetzt", remainder: "abgesetzt" },
      { kind: "unparsed_attribute", articleNumber: "98010", text: "Ø 12 mm" },
    ]));
  });

  it("treats a second value for the same key as unparsed", () => {
    const result = mapArticles(
      [article({ description1: "Höhe 8 mm", description2: "Höhe 9 mm" }), article({ product_id: 9003, number: "98030", name: "Testschlüssel" })],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.article_attributes.filter((a) => a.article_number === "98010")).toHaveLength(1);
    expect(result.value.articles[0].note).toBe("Höhe 9 mm");
  });

  it("moves non-integer packaging to the note", () => {
    const result = mapArticles(
      [article({ vpe1: "wird passend verpackt …", vpe2: "  " }), article({ product_id: 9003, number: "98030", name: "Testschlüssel" })],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles[0].note).toBe("wird passend verpackt …");
    expect(result.value.findings).toContainEqual({ kind: "packaging_note", articleNumber: "98010", text: "wird passend verpackt …" });
    expect(result.value.article_packaging.filter((p) => p.article_number === "98010")).toEqual([]);
  });

  it("gives a shared article one home product and accessory rows elsewhere", () => {
    const result = mapArticles(
      [
        article({ product_id: 9003, number: "98010", prio: 12000 }),
        article({ product_id: 9001, number: "98010", prio: 10000 }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles.filter((a) => a.article_number === "98010")).toEqual([
      expect.objectContaining({ legacy_product_id: 9001 }),
    ]);
    expect(result.value.product_accessories).toEqual([
      { legacy_product_id: 9003, article_number: "98010", sort_order: 12000 },
    ]);
    expect(result.value.findings).toContainEqual({
      kind: "shared_article",
      articleNumber: "98010",
      homeLegacyProductId: 9001,
      accessoryLegacyProductIds: [9003],
    });
  });

  it("rejects an article of an unknown product", () => {
    const result = mapArticles([article({ product_id: 9009 })], products);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_data", message: "article 98010 references unknown product 9009" },
    });
  });

  it("rejects a product without articles", () => {
    const result = mapArticles([article()], products);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_data", message: "product 9003 has no articles" },
    });
  });

  it("rejects a duplicate number within one product and a blank number", () => {
    expect(mapArticles([article(), article(), article({ product_id: 9003, number: "98030" })], products).ok).toBe(false);
    expect(mapArticles([article({ number: " " }), article({ product_id: 9003, number: "98030" })], products).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/articles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/map/articles.mts`:

```ts
import type { Finding, MapError } from "../findings.mts";
import type {
  PayloadArticle,
  PayloadArticleAttribute,
  PayloadArticlePackaging,
  PayloadProduct,
  PayloadProductAccessory,
} from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotArticle } from "../snapshot.mts";
import { parseFragment } from "./attributes.mts";
import { cleanText } from "./text.mts";

export type ArticleMapping = {
  articles: PayloadArticle[];
  article_attributes: PayloadArticleAttribute[];
  article_packaging: PayloadArticlePackaging[];
  product_accessories: PayloadProductAccessory[];
  findings: Finding[];
  fragments: { total: number; typed: number };
};

const invalid = (message: string): Result<never, MapError> =>
  err({ kind: "invalid_data", message });

export function mapArticles(
  input: readonly SnapshotArticle[],
  products: readonly PayloadProduct[]
): Result<ArticleMapping, MapError> {
  const productById = new Map(products.map((p) => [p.legacy_product_id, p]));
  const groups = new Map<string, SnapshotArticle[]>();
  for (const a of input) {
    if (a.number.trim() === "") return invalid(`article in product ${a.product_id} has no number`);
    if (!productById.has(a.product_id))
      return invalid(`article ${a.number} references unknown product ${a.product_id}`);
    const group = groups.get(a.number) ?? [];
    if (group.some((g) => g.product_id === a.product_id))
      return invalid(`article ${a.number} appears twice in product ${a.product_id}`);
    group.push(a);
    groups.set(a.number, group);
  }

  const out: ArticleMapping = {
    articles: [],
    article_attributes: [],
    article_packaging: [],
    product_accessories: [],
    findings: [],
    fragments: { total: 0, typed: 0 },
  };

  for (const [number, group] of groups) {
    const [home, ...others] = [...group].sort((a, b) => a.product_id - b.product_id);
    if (home === undefined) continue;
    for (const o of others)
      out.product_accessories.push({ legacy_product_id: o.product_id, article_number: number, sort_order: o.prio });
    if (others.length > 0)
      out.findings.push({
        kind: "shared_article",
        articleNumber: number,
        homeLegacyProductId: home.product_id,
        accessoryLegacyProductIds: others.map((o) => o.product_id),
      });

    const paragraphs: string[] = [];
    const notes: string[] = [];
    const usedKeys = new Set<string>();
    for (const raw of [home.description1, home.description2, home.description3, home.description4]) {
      const text = cleanText(raw);
      if (text === null) continue;
      out.fragments.total += 1;
      const parsed = parseFragment(text);
      if (parsed.kind === "typed" && parsed.values.every((v) => !usedKeys.has(v.key))) {
        out.fragments.typed += 1;
        for (const v of parsed.values) {
          usedKeys.add(v.key);
          out.article_attributes.push({ article_number: number, key: v.key, value_decimal: v.value, value_text: null });
        }
        if (parsed.note !== null) notes.push(parsed.note);
        if (parsed.partial && parsed.note !== null)
          out.findings.push({ kind: "partial_attribute", articleNumber: number, text, remainder: parsed.note });
      } else if (parsed.kind === "sentence") {
        paragraphs.push(parsed.text);
      } else {
        notes.push(text);
        out.findings.push({ kind: "unparsed_attribute", articleNumber: number, text });
      }
    }

    const quantities = new Set<number>();
    [home.vpe1, home.vpe2, home.vpe3, home.vpe4].forEach((raw, index) => {
      const text = cleanText(raw);
      if (text === null) return;
      const quantity = /^\d+$/.test(text) ? Number(text) : 0;
      if (quantity > 0) {
        if (quantities.has(quantity)) return;
        quantities.add(quantity);
        out.article_packaging.push({ article_number: number, quantity, sort_order: index });
      } else {
        notes.push(text);
        out.findings.push({ kind: "packaging_note", articleNumber: number, text });
      }
    });

    const productName = productById.get(home.product_id)?.name ?? null;
    const name = cleanText(home.name);
    out.articles.push({
      article_number: number,
      legacy_product_id: home.product_id,
      name: name === productName ? null : name,
      description: paragraphs.length > 0 ? paragraphs.join("\n\n") : null,
      note: notes.length > 0 ? notes.join("\n") : null,
      sort_order: home.prio,
    });
  }

  const withArticles = new Set(out.articles.map((a) => a.legacy_product_id));
  const empty = products.find((p) => !withArticles.has(p.legacy_product_id));
  if (empty !== undefined) return invalid(`product ${empty.legacy_product_id} has no articles`);
  return ok(out);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import/articles.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/map/articles.mts tests/import/articles.test.ts
git commit -m "feat(import): article mapping with packaging and shared articles"
```

---

### Task 5: Colour mapping (FR-6)

**Files:**
- Create: `scripts/import/map/colors.mts`
- Test: `tests/import/colors.test.ts`

**Interfaces:**
- Consumes: Task 1/2 types, `cleanText`
- Produces:
  - `COLOR_FAMILIES: Readonly<Record<string, string>>` — `0` natur, `1` weiß, `2` schwarz, `3` braun, `4` grau, `5` grün, `6` blau, `8` rot, `9` orange, `10` beige
  - `splitColorName(raw: string): { name: string; ral_reference: string | null }`
  - `mapColors(colors: readonly SnapshotColor[], links: readonly SnapshotProductColor[], productIds: ReadonlySet<number>): Result<{ colors: PayloadColor[]; product_colors: PayloadProductColor[]; findings: Finding[] }, MapError>`

Rules:
- Only colours referenced by a link are imported. Unused colours are never validated.
- Hex is upper-cased; it must match `^#[0-9A-F]{6}$` (else invalid).
- Family from the part of `color_id` before the first `-`; unknown prefix → invalid (`colour 7-1 has unknown family prefix "7"`).
- Canonical colour = (`name`, `hex`) after the split; several legacy ids with the same canonical colour (among used ones) → one colour + `merged_color` finding (`legacyColorIds` sorted).
- A link to an unknown product or unknown colour id → invalid.
- Per product: links sorted by suffix ascending; a canonical colour linked twice keeps the lower suffix; default = suffix `0`, else lowest suffix → `default_color_by_rule` finding; `sort_order` = position; `suffix` = `String(color_suffix)`.
- Output colours sorted by name, then hex (deterministic).

- [ ] **Step 1: Write the failing test**

`tests/import/colors.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapColors, splitColorName } from "../../scripts/import/map/colors.mts";
import { color, link } from "./factory";

const ids = new Set([9001, 9002]);

describe("splitColorName (FR-6, SC-6)", () => {
  it("splits name and RAL reference", () => {
    expect(splitColorName("testweiß (ähnlich RAL 9016)")).toEqual({ name: "testweiß", ral_reference: "ähnlich RAL 9016" });
  });
  it("keeps names without a reference", () => {
    expect(splitColorName(" test blau Vach ")).toEqual({ name: "test blau Vach", ral_reference: null });
  });
});

describe("mapColors (FR-6, SC-6)", () => {
  it("maps used colours with family and default", () => {
    const result = mapColors(
      [color(), color({ color_id: "3-1", name: "testbraun", code: "#5b3a29" }), color({ color_id: "6-9", name: "ungenutzt", code: "kaputt" })],
      [link({ color_id: "3-1", color_suffix: 1 }), link({ color_id: "1-1", color_suffix: 0 })],
      ids
    );
    expect(result).toEqual({
      ok: true,
      value: {
        colors: [
          { name: "testbraun", ral_reference: null, hex_code: "#5B3A29", family: "braun" },
          { name: "testweiß", ral_reference: "ähnlich RAL 9016", hex_code: "#F2F5F3", family: "weiß" },
        ],
        product_colors: [
          { legacy_product_id: 9001, color_name: "testweiß", color_hex: "#F2F5F3", suffix: "0", is_default: true, sort_order: 0 },
          { legacy_product_id: 9001, color_name: "testbraun", color_hex: "#5B3A29", suffix: "1", is_default: false, sort_order: 1 },
        ],
        findings: [],
      },
    });
  });

  it("picks the lowest suffix when there is no suffix 0 and reports it", () => {
    const result = mapColors(
      [color(), color({ color_id: "3-1", name: "testbraun", code: "#5B3A29" })],
      [link({ product_id: 9002, color_id: "3-1", color_suffix: 3 }), link({ product_id: 9002, color_id: "1-1", color_suffix: 1 })],
      ids
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.product_colors.find((c) => c.is_default)).toMatchObject({ color_name: "testweiß", suffix: "1" });
    expect(result.value.findings).toEqual([{ kind: "default_color_by_rule", legacyProductId: 9002, suffix: "1" }]);
  });

  it("merges exact duplicates and reports them", () => {
    const result = mapColors(
      [color({ color_id: "4-1", name: "testgrau", code: "#8A8D8F" }), color({ color_id: "4-2", name: "testgrau", code: "#8a8d8f" })],
      [link({ color_id: "4-1", color_suffix: 0 }), link({ color_id: "4-2", color_suffix: 2 }), link({ product_id: 9002, color_id: "4-2", color_suffix: 0 })],
      ids
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.colors).toHaveLength(1);
    expect(result.value.product_colors.filter((c) => c.legacy_product_id === 9001)).toEqual([
      { legacy_product_id: 9001, color_name: "testgrau", color_hex: "#8A8D8F", suffix: "0", is_default: true, sort_order: 0 },
    ]);
    expect(result.value.findings).toContainEqual({ kind: "merged_color", name: "testgrau", hex: "#8A8D8F", legacyColorIds: ["4-1", "4-2"] });
  });

  it("rejects an unknown family prefix, a bad hex and unknown references", () => {
    expect(mapColors([color({ color_id: "7-1" })], [link({ color_id: "7-1" })], ids).ok).toBe(false);
    expect(mapColors([color({ code: "F2F5F3" })], [link()], ids).ok).toBe(false);
    expect(mapColors([color()], [link({ color_id: "1-9" })], ids).ok).toBe(false);
    expect(mapColors([color()], [link({ product_id: 9999 })], ids).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/colors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/map/colors.mts`:

```ts
import type { Finding, MapError } from "../findings.mts";
import type { PayloadColor, PayloadProductColor } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotColor, SnapshotProductColor } from "../snapshot.mts";
import { cleanText } from "./text.mts";

// Legacy colour ids look like "<family>-<n>"; the prefix is the colour family.
export const COLOR_FAMILIES: Readonly<Record<string, string>> = {
  "0": "natur",
  "1": "weiß",
  "2": "schwarz",
  "3": "braun",
  "4": "grau",
  "5": "grün",
  "6": "blau",
  "8": "rot",
  "9": "orange",
  "10": "beige",
};

const invalid = (message: string): Result<never, MapError> =>
  err({ kind: "invalid_data", message });

export function splitColorName(raw: string): { name: string; ral_reference: string | null } {
  const text = cleanText(raw) ?? "";
  const match = /^(.*?)\s*\((ähnlich RAL [^)]+)\)$/.exec(text);
  return match ? { name: match[1], ral_reference: match[2] } : { name: text, ral_reference: null };
}

export function mapColors(
  colors: readonly SnapshotColor[],
  links: readonly SnapshotProductColor[],
  productIds: ReadonlySet<number>
): Result<{ colors: PayloadColor[]; product_colors: PayloadProductColor[]; findings: Finding[] }, MapError> {
  const legacy = new Map(colors.map((c) => [c.color_id, c]));
  const canonical = new Map<string, PayloadColor & { legacyIds: Set<string> }>();
  const keyOf = new Map<string, string>();

  for (const l of links) {
    if (!productIds.has(l.product_id)) return invalid(`colour link references unknown product ${l.product_id}`);
    const source = legacy.get(l.color_id);
    if (source === undefined) return invalid(`product ${l.product_id} references unknown colour ${l.color_id}`);
    if (keyOf.has(l.color_id)) continue;
    const prefix = l.color_id.split("-")[0] ?? "";
    const family = COLOR_FAMILIES[prefix];
    if (family === undefined) return invalid(`colour ${l.color_id} has unknown family prefix "${prefix}"`);
    const hex = source.code.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) return invalid(`colour ${l.color_id} has invalid hex code "${source.code}"`);
    const { name, ral_reference } = splitColorName(source.name);
    if (name === "") return invalid(`colour ${l.color_id} has no name`);
    const key = `${name}|${hex}`;
    keyOf.set(l.color_id, key);
    const existing = canonical.get(key);
    if (existing) existing.legacyIds.add(l.color_id);
    else canonical.set(key, { name, ral_reference, hex_code: hex, family, legacyIds: new Set([l.color_id]) });
  }

  const findings: Finding[] = [];
  for (const c of canonical.values())
    if (c.legacyIds.size > 1)
      findings.push({ kind: "merged_color", name: c.name, hex: c.hex_code, legacyColorIds: [...c.legacyIds].sort() });

  const byProduct = new Map<number, SnapshotProductColor[]>();
  for (const l of links) byProduct.set(l.product_id, [...(byProduct.get(l.product_id) ?? []), l]);

  const product_colors: PayloadProductColor[] = [];
  for (const [productId, productLinks] of byProduct) {
    const sorted = [...productLinks].sort((a, b) => a.color_suffix - b.color_suffix);
    const seen = new Set<string>();
    const rows = sorted.filter((l) => {
      const key = keyOf.get(l.color_id) ?? l.color_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const defaultIndex = Math.max(0, rows.findIndex((l) => l.color_suffix === 0));
    rows.forEach((l, index) => {
      const c = canonical.get(keyOf.get(l.color_id) ?? "");
      if (c === undefined) return;
      product_colors.push({
        legacy_product_id: productId,
        color_name: c.name,
        color_hex: c.hex_code,
        suffix: String(l.color_suffix),
        is_default: index === defaultIndex,
        sort_order: index,
      });
    });
    const chosen = rows[defaultIndex];
    if (chosen !== undefined && chosen.color_suffix !== 0)
      findings.push({ kind: "default_color_by_rule", legacyProductId: productId, suffix: String(chosen.color_suffix) });
  }

  const payloadColors = [...canonical.values()]
    .map(({ legacyIds: _ids, ...c }) => c)
    .sort((a, b) => a.name.localeCompare(b.name, "de") || a.hex_code.localeCompare(b.hex_code));
  return ok({ colors: payloadColors, product_colors, findings });
}
```

Note: `rows.findIndex(...)` is `-1` without a suffix-0 row; `Math.max(0, …)` picks index 0 = lowest suffix (rows are sorted).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import/colors.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. If ESLint flags the unused destructured `_ids`, rename per the repo's `no-unused-vars` config or use `Object.fromEntries` filtering — no `eslint-disable`.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/map/colors.mts tests/import/colors.test.ts
git commit -m "feat(import): colour mapping with explicit defaults"
```

---

### Task 6: Media mapping (FR-7 part 1)

**Files:**
- Create: `scripts/import/map/media.mts`
- Test: `tests/import/media.test.ts`

**Interfaces:**
- Consumes: `slugify`, `cleanText` (Task 1); `PayloadProduct`, `PayloadProductMedia`, `Finding`, `MapError` (Task 2)
- Produces:
  - `type MediaDraft = { storage_path: string; alt_text: string; url: string; content_type: string; legacy_product_id: number }`
  - `resolveImageUrl(reference: string, baseUrl: string): string`
  - `normaliseFileName(reference: string): string | null` — null for unsupported extensions or an empty base name
  - `mapMedia(products: readonly SnapshotProduct[], rows: readonly PayloadProduct[], baseUrl: string): Result<{ media: MediaDraft[]; product_media: PayloadProductMedia[]; findings: Finding[] }, MapError>`

Rules:
- Absolute `http(s)` references are used as they are (via `new URL(...).href`). Relative references: trim, strip leading `/`, replace spaces with `_`, resolve against `baseUrl` (a trailing `/` is added if missing). `new URL` percent-encodes umlauts.
- File name: last path segment, URL-decoded if possible, extension lower-cased (`webp`, `png`, `jpg`, `jpeg` only), base name `slugify`d.
- Path: `products/{category_slug}/{slug}/{file}`.
- First non-blank small image → `thumbnail` (sort 0); big images → `gallery` (sort 1, 2, …); further small images → `skipped_image` finding; a reference whose path repeats within the product → `skipped_image` finding.
- Unsupported reference → invalid (`product 9001: unsupported image reference "/datei.gif"`).
- `alt_text` = product name; every media → `alt_text_review` finding.

- [ ] **Step 1: Write the failing test**

`tests/import/media.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapMedia, normaliseFileName, resolveImageUrl } from "../../scripts/import/map/media.mts";
import type { PayloadProduct } from "../../scripts/import/payload.mts";
import { product } from "./factory";

const base = "https://cdn.example.test/img/upload/v1/Folder";
const row: PayloadProduct = {
  legacy_product_id: 9001,
  category_slug: "moebel",
  slug: "testkeil-mit-daempfung",
  name: "Testkeil mit Dämpfung",
  subtitle: null,
  description: null,
  material_code: null,
  material_note: null,
  sort_order: 0,
};

describe("resolveImageUrl (FR-7, SC-7)", () => {
  it("resolves relative references and replaces spaces", () => {
    expect(resolveImageUrl("/a_98020 Testhalter.webp", base)).toBe(
      "https://cdn.example.test/img/upload/v1/Folder/a_98020_Testhalter.webp"
    );
  });
  it("encodes umlauts", () => {
    expect(resolveImageUrl("a_98030-Türpuffer.webp", `${base}/`)).toBe(
      "https://cdn.example.test/img/upload/v1/Folder/a_98030-T%C3%BCrpuffer.webp"
    );
  });
  it("keeps absolute references", () => {
    expect(resolveImageUrl("https://other.example.test/x/a.webp", base)).toBe("https://other.example.test/x/a.webp");
  });
});

describe("normaliseFileName (FR-7, SC-7)", () => {
  it("produces ASCII names without spaces", () => {
    expect(normaliseFileName("/a_98020 Testhalter.webp")).toBe("a-98020-testhalter.webp");
    expect(normaliseFileName("https://x.test/b1_98030-T%C3%BCrpuffer.WEBP")).toBe("b1-98030-tuerpuffer.webp");
  });
  it("rejects unsupported or empty names", () => {
    expect(normaliseFileName("/datei.gif")).toBeNull();
    expect(normaliseFileName("/.webp")).toBeNull();
    expect(normaliseFileName("/ohne-endung")).toBeNull();
  });
});

describe("mapMedia (FR-7, SC-7)", () => {
  it("assigns roles, paths and alt texts", () => {
    const result = mapMedia(
      [product({ imageUrls_small: ["/a_98010-Testkeil.webp", "/a_98010-Extra.webp"], imageUrls_big: ["/b1_98010-Testkeil.webp", "/b2_98010-Testkeil.webp"] })],
      [row],
      base
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dir = "products/moebel/testkeil-mit-daempfung";
    expect(result.value.product_media).toEqual([
      { legacy_product_id: 9001, storage_path: `${dir}/a-98010-testkeil.webp`, role: "thumbnail", sort_order: 0 },
      { legacy_product_id: 9001, storage_path: `${dir}/b1-98010-testkeil.webp`, role: "gallery", sort_order: 1 },
      { legacy_product_id: 9001, storage_path: `${dir}/b2-98010-testkeil.webp`, role: "gallery", sort_order: 2 },
    ]);
    expect(result.value.media[0]).toEqual({
      storage_path: `${dir}/a-98010-testkeil.webp`,
      alt_text: "Testkeil mit Dämpfung",
      url: `${base}/a_98010-Testkeil.webp`,
      content_type: "image/webp",
      legacy_product_id: 9001,
    });
    expect(result.value.findings).toContainEqual({ kind: "skipped_image", legacyProductId: 9001, reference: "/a_98010-Extra.webp" });
    expect(result.value.findings.filter((f) => f.kind === "alt_text_review")).toHaveLength(3);
  });

  it("skips a repeated image within a product", () => {
    const result = mapMedia([product({ imageUrls_small: ["/a.webp"], imageUrls_big: ["/a.webp", " "] })], [row], base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.product_media).toHaveLength(1);
    expect(result.value.findings).toContainEqual({ kind: "skipped_image", legacyProductId: 9001, reference: "/a.webp" });
  });

  it("handles products without images", () => {
    const result = mapMedia([product({ imageUrls_small: [], imageUrls_big: [] })], [row], base);
    expect(result.ok && result.value.media).toEqual([]);
  });

  it("rejects an unsupported reference", () => {
    const result = mapMedia([product({ imageUrls_small: ["/datei.gif"] })], [row], base);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_data", message: 'product 9001: unsupported image reference "/datei.gif"' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/media.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/map/media.mts`:

```ts
import type { Finding, MapError } from "../findings.mts";
import type { PayloadProduct, PayloadProductMedia } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { SnapshotProduct } from "../snapshot.mts";
import { cleanText, slugify } from "./text.mts";

export type MediaDraft = {
  storage_path: string;
  alt_text: string;
  url: string;
  content_type: string;
  legacy_product_id: number;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function resolveImageUrl(reference: string, baseUrl: string): string {
  const trimmed = reference.trim();
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).href;
  // Same convention as the old app: CDN public ids use "_" instead of spaces.
  const path = trimmed.replace(/^\/+/, "").replace(/ /g, "_");
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normaliseFileName(reference: string): string | null {
  const segment = decode(reference.trim().split(/[/\\]/).pop() ?? "");
  const dot = segment.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = segment.slice(dot + 1).toLowerCase();
  if (CONTENT_TYPES[extension] === undefined) return null;
  const base = slugify(segment.slice(0, dot));
  return base === "" ? null : `${base}.${extension}`;
}

export function mapMedia(
  products: readonly SnapshotProduct[],
  rows: readonly PayloadProduct[],
  baseUrl: string
): Result<{ media: MediaDraft[]; product_media: PayloadProductMedia[]; findings: Finding[] }, MapError> {
  const rowById = new Map(rows.map((r) => [r.legacy_product_id, r]));
  const media: MediaDraft[] = [];
  const product_media: PayloadProductMedia[] = [];
  const findings: Finding[] = [];

  for (const p of products) {
    const row = rowById.get(p.product_id);
    if (row === undefined) return err({ kind: "invalid_data", message: `media for unknown product ${p.product_id}` });
    const small = p.imageUrls_small.filter((r) => cleanText(r) !== null);
    const big = p.imageUrls_big.filter((r) => cleanText(r) !== null);
    for (const reference of small.slice(1))
      findings.push({ kind: "skipped_image", legacyProductId: row.legacy_product_id, reference });

    const entries = [
      ...small.slice(0, 1).map((reference) => ({ reference, role: "thumbnail" as const })),
      ...big.map((reference) => ({ reference, role: "gallery" as const })),
    ];
    const used = new Set<string>();
    for (const { reference, role } of entries) {
      const file = normaliseFileName(reference);
      if (file === null)
        return err({ kind: "invalid_data", message: `product ${row.legacy_product_id}: unsupported image reference "${reference}"` });
      const storage_path = `products/${row.category_slug}/${row.slug}/${file}`;
      if (used.has(storage_path)) {
        findings.push({ kind: "skipped_image", legacyProductId: row.legacy_product_id, reference });
        continue;
      }
      used.add(storage_path);
      const extension = file.slice(file.lastIndexOf(".") + 1);
      media.push({
        storage_path,
        alt_text: row.name,
        url: resolveImageUrl(reference, baseUrl),
        content_type: CONTENT_TYPES[extension] ?? "application/octet-stream",
        legacy_product_id: row.legacy_product_id,
      });
      product_media.push({ legacy_product_id: row.legacy_product_id, storage_path, role, sort_order: used.size - 1 });
      findings.push({ kind: "alt_text_review", storagePath: storage_path });
    }
  }
  return ok({ media, product_media, findings });
}
```

Note on `sort_order`: thumbnail is 0, gallery images 1, 2, … (because the thumbnail is the first entry); if a product has no small image, its first gallery image gets 0 — acceptable.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import/media.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/map/media.mts tests/import/media.test.ts
git commit -m "feat(import): media mapping with normalised storage paths"
```

---

### Task 7: `mapSnapshot` and `completePayload` (FR-3–FR-7 combined)

**Files:**
- Create: `scripts/import/map/index.mts`
- Test: `tests/import/map-snapshot.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6
- Produces:
  - `type CatalogStats = { products: number; articles: number; accessories: number; colors: number; materials: number; attributes: number; images: number; fragments: number; typedFragments: number }`
  - `type MappedCatalog = { payload: Omit<ImportPayload, "media">; media: MediaDraft[]; findings: Finding[]; stats: CatalogStats }`
  - `type Dimensions = { width: number; height: number }`
  - `mapSnapshot(snapshot: Snapshot, options: { imageBaseUrl: string }): Result<MappedCatalog, MapError>`
  - `completePayload(mapped: MappedCatalog, dimensions: ReadonlyMap<string, Dimensions>): Result<ImportPayload, MapError>` — `invalid_data` if a media path has no dimensions

Rules:
- `categories` = all `CATEGORIES`.
- `materials` = `MATERIALS` entries whose code is used by a product (sorted by code).
- `attributes` = `ATTRIBUTES` entries used by at least one article attribute (in `ATTRIBUTES` order).
- `category_attributes` = distinct (product category, attribute key) pairs, `sort_order` = attribute `sort_order`, sorted by category then sort_order.
- Findings order: products, articles, colours, media.
- `stats` from the mapped arrays; `fragments`/`typedFragments` from `ArticleMapping.fragments`.

- [ ] **Step 1: Write the failing test**

`tests/import/map-snapshot.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { completePayload, mapSnapshot } from "../../scripts/import/map/index.mts";
import { article, color, link, product, snapshot } from "./factory";

const options = { imageBaseUrl: "https://cdn.example.test/base" };

describe("mapSnapshot", () => {
  it("combines all mappings into one payload", () => {
    const result = mapSnapshot(
      snapshot({
        products: [product(), product({ product_id: 9002, category: "wasser", name: "Testsiphon", material: "TPE", imageUrls_small: [], imageUrls_big: [] })],
        articles: [article(), article({ product_id: 9002, number: "98020", description1: "für Schlauch Ø 10 mm" })],
        colors: [color()],
        product_colors_connection: [link()],
      }),
      options
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { payload, stats, media } = result.value;
    expect(payload.categories.map((c) => c.slug)).toEqual(["moebel", "halterung", "wasser", "lueftung", "elektro"]);
    expect(payload.materials.map((m) => m.code)).toEqual(["PA-6", "TPE"]);
    expect(payload.attributes.map((a) => a.key)).toEqual(["height", "hose_diameter"]);
    expect(payload.category_attributes).toEqual([
      { category_slug: "moebel", attribute_key: "height", sort_order: 10 },
      { category_slug: "wasser", attribute_key: "hose_diameter", sort_order: 70 },
    ]);
    expect(media).toHaveLength(2);
    expect(stats).toEqual({
      products: 2, articles: 2, accessories: 0, colors: 1, materials: 2, attributes: 2,
      images: 2, fragments: 2, typedFragments: 2,
    });
  });

  it("passes mapping errors through", () => {
    const result = mapSnapshot(snapshot({ articles: [article({ product_id: 9009 })] }), options);
    expect(result.ok).toBe(false);
  });
});

describe("completePayload", () => {
  it("adds dimensions to every media row", () => {
    const mapped = mapSnapshot(snapshot(), options);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const dims = new Map(mapped.value.media.map((m) => [m.storage_path, { width: 40, height: 30 }]));
    const result = completePayload(mapped.value, dims);
    expect(result.ok && result.value.media).toEqual(
      mapped.value.media.map((m) => ({ storage_path: m.storage_path, width: 40, height: 30, alt_text: m.alt_text }))
    );
  });

  it("fails when a dimension is missing", () => {
    const mapped = mapSnapshot(snapshot(), options);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(completePayload(mapped.value, new Map()).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/map-snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/map/index.mts`:

```ts
import { CATEGORIES } from "../categories.mts";
import type { Finding, MapError } from "../findings.mts";
import type { ImportPayload, PayloadCategoryAttribute, PayloadMedia } from "../payload.mts";
import { err, ok, type Result } from "../result.mts";
import type { Snapshot } from "../snapshot.mts";
import { mapArticles } from "./articles.mts";
import { ATTRIBUTES } from "./attributes.mts";
import { mapColors } from "./colors.mts";
import { MATERIALS } from "./materials.mts";
import { mapMedia, type MediaDraft } from "./media.mts";
import { mapProducts } from "./products.mts";

export type CatalogStats = {
  products: number;
  articles: number;
  accessories: number;
  colors: number;
  materials: number;
  attributes: number;
  images: number;
  fragments: number;
  typedFragments: number;
};
export type MappedCatalog = {
  payload: Omit<ImportPayload, "media">;
  media: MediaDraft[];
  findings: Finding[];
  stats: CatalogStats;
};
export type Dimensions = { width: number; height: number };

export function mapSnapshot(
  snapshot: Snapshot,
  options: { imageBaseUrl: string }
): Result<MappedCatalog, MapError> {
  const products = mapProducts(snapshot.products);
  if (!products.ok) return products;
  const rows = products.value.products;
  const articles = mapArticles(snapshot.articles, rows);
  if (!articles.ok) return articles;
  const colors = mapColors(
    snapshot.colors,
    snapshot.product_colors_connection,
    new Set(rows.map((p) => p.legacy_product_id))
  );
  if (!colors.ok) return colors;
  const media = mapMedia(snapshot.products, rows, options.imageBaseUrl);
  if (!media.ok) return media;

  const usedCodes = new Set(rows.map((p) => p.material_code).filter((c): c is string => c !== null));
  const materials = MATERIALS.filter((m) => usedCodes.has(m.code)).sort((a, b) => a.code.localeCompare(b.code));
  const usedKeys = new Set(articles.value.article_attributes.map((a) => a.key));
  const attributes = ATTRIBUTES.filter((a) => usedKeys.has(a.key));

  const categoryOf = new Map(rows.map((p) => [p.legacy_product_id, p.category_slug]));
  const productOf = new Map(articles.value.articles.map((a) => [a.article_number, a.legacy_product_id]));
  const sortOf = new Map(ATTRIBUTES.map((a) => [a.key, a.sort_order]));
  const pairs = new Map<string, PayloadCategoryAttribute>();
  for (const value of articles.value.article_attributes) {
    const category = categoryOf.get(productOf.get(value.article_number) ?? -1);
    if (category === undefined) continue;
    pairs.set(`${category}|${value.key}`, {
      category_slug: category,
      attribute_key: value.key,
      sort_order: sortOf.get(value.key) ?? 0,
    });
  }
  const category_attributes = [...pairs.values()].sort(
    (a, b) => a.category_slug.localeCompare(b.category_slug) || a.sort_order - b.sort_order
  );

  return ok({
    payload: {
      categories: [...CATEGORIES],
      materials,
      attributes,
      category_attributes,
      colors: colors.value.colors,
      products: rows,
      articles: articles.value.articles,
      article_attributes: articles.value.article_attributes,
      article_packaging: articles.value.article_packaging,
      product_colors: colors.value.product_colors,
      product_media: media.value.product_media,
      product_accessories: articles.value.product_accessories,
    },
    media: media.value.media,
    findings: [...products.value.findings, ...articles.value.findings, ...colors.value.findings, ...media.value.findings],
    stats: {
      products: rows.length,
      articles: articles.value.articles.length,
      accessories: articles.value.product_accessories.length,
      colors: colors.value.colors.length,
      materials: materials.length,
      attributes: attributes.length,
      images: media.value.media.length,
      fragments: articles.value.fragments.total,
      typedFragments: articles.value.fragments.typed,
    },
  });
}

export function completePayload(
  mapped: MappedCatalog,
  dimensions: ReadonlyMap<string, Dimensions>
): Result<ImportPayload, MapError> {
  const media: PayloadMedia[] = [];
  for (const m of mapped.media) {
    const size = dimensions.get(m.storage_path);
    if (size === undefined) return err({ kind: "invalid_data", message: `no dimensions for ${m.storage_path}` });
    media.push({ storage_path: m.storage_path, width: size.width, height: size.height, alt_text: m.alt_text });
  }
  return ok({ ...mapped.payload, media });
}
```

Note: `category_attributes` sort in the test expects `moebel` before `wasser` — `localeCompare` does that.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/map/index.mts tests/import/map-snapshot.test.ts
git commit -m "feat(import): combine mappings into the import payload"
```

---

### Task 8: Import report (FR-11)

**Files:**
- Create: `scripts/import/report.mts`
- Test: `tests/import/report.test.ts`

**Interfaces:**
- Consumes: `Finding` (Task 2), `CatalogStats` (Task 7)
- Produces:
  - `type ReportInput = { generatedAt: Date; mode: "dry-run" | "import"; outcome: string; stats: CatalogStats | null; findings: readonly Finding[]; result: Readonly<Record<string, unknown>> | null }`
  - `renderReport(input: ReportInput): string`
  - `writeReport(path: string, input: ReportInput): Promise<void>`

Format (exact headings, sections in this order, empty sections omitted):

```
# Import report

- Generated: <ISO timestamp>
- Mode: dry run | import
- Outcome: <outcome>

## Summary

| Item | Count |
| --- | --- |
| Products | n |
| Articles | n |
| Accessory links | n |
| Colours | n |
| Materials | n |
| Attributes | n |
| Images | n |
| Typed description fragments | x of y |

## Database result

| Key | Value |
| --- | --- |
| products | 3 |
…

## Failed image downloads
## Unparsed attribute values
## Partially parsed attribute values
## Material fallbacks
## Default colour set by rule
## Merged colours
## Shared articles
## Slug collisions
## Skipped images
## Packaging notes
## Alt texts to review
```

Line formats (one bullet per finding; text values in backticks):
- failed_image: ``- `<storagePath>` ← <url>: <reason>``
- unparsed_attribute: ``- <articleNumber>: `<text>` ``
- partial_attribute: ``- <articleNumber>: `<text>` → note `<remainder>` ``
- material_fallback: ``- product <id>: `<text>` ``
- default_color_by_rule: ``- product <id>: suffix `<suffix>` ``
- merged_color: ``- `<name>` <hex>: <ids joined by ", "> ``
- shared_article: ``- <articleNumber>: home product <id>, accessory of <ids joined by ", "> ``
- slug_collision: ``- product <id>: `<slug>` (name + subtitle | name + legacy id)``
- skipped_image: ``- product <id>: `<reference>` ``
- packaging_note: ``- <articleNumber>: `<text>` ``
- alt_text_review: ``- `<storagePath>` ``

Each section heading is followed by a count line: `<n> entries.` Summary is omitted when `stats` is null; Database result when `result` is null.

- [ ] **Step 1: Write the failing test**

`tests/import/report.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Finding } from "../../scripts/import/findings.mts";
import { renderReport } from "../../scripts/import/report.mts";

const all: Finding[] = [
  { kind: "failed_image", url: "https://cdn.test/a.webp", storagePath: "products/m/p/a.webp", reason: "HTTP 404" },
  { kind: "unparsed_attribute", articleNumber: "98020", text: "Ø 12 mm" },
  { kind: "partial_attribute", articleNumber: "98011/80", text: "Höhe 9,5 mm abgesetzt", remainder: "abgesetzt" },
  { kind: "material_fallback", legacyProductId: 9002, text: "A: PA-6 / B: ABS" },
  { kind: "default_color_by_rule", legacyProductId: 9002, suffix: "1" },
  { kind: "merged_color", name: "testgrau", hex: "#8A8D8F", legacyColorIds: ["4-1", "4-2"] },
  { kind: "shared_article", articleNumber: "98010", homeLegacyProductId: 9001, accessoryLegacyProductIds: [9003] },
  { kind: "slug_collision", legacyProductId: 9004, slug: "testtraeger-fuer-16-mm", level: "subtitle" },
  { kind: "skipped_image", legacyProductId: 9001, reference: "/a_extra.webp" },
  { kind: "packaging_note", articleNumber: "98020", text: "wird passend verpackt" },
  { kind: "alt_text_review", storagePath: "products/m/p/a.webp" },
];

const stats = { products: 3, articles: 4, accessories: 1, colors: 3, materials: 2, attributes: 1, images: 3, fragments: 5, typedFragments: 2 };

describe("renderReport (FR-11, SC-11)", () => {
  it("renders every finding type with its identifiers", () => {
    const md = renderReport({
      generatedAt: new Date("2026-10-09T10:00:00.000Z"),
      mode: "import",
      outcome: "imported",
      stats,
      findings: all,
      result: { products: 3, deleted_products: 0 },
    });
    expect(md).toContain("# Import report");
    expect(md).toContain("- Generated: 2026-10-09T10:00:00.000Z");
    expect(md).toContain("- Mode: import");
    expect(md).toContain("| Typed description fragments | 2 of 5 |");
    expect(md).toContain("| deleted_products | 0 |");
    for (const line of [
      "- `products/m/p/a.webp` ← https://cdn.test/a.webp: HTTP 404",
      "- 98020: `Ø 12 mm`",
      "- 98011/80: `Höhe 9,5 mm abgesetzt` → note `abgesetzt`",
      "- product 9002: `A: PA-6 / B: ABS`",
      "- product 9002: suffix `1`",
      "- `testgrau` #8A8D8F: 4-1, 4-2",
      "- 98010: home product 9001, accessory of 9003",
      "- product 9004: `testtraeger-fuer-16-mm` (name + subtitle)",
      "- product 9001: `/a_extra.webp`",
      "- 98020: `wird passend verpackt`",
      "- `products/m/p/a.webp`",
    ]) {
      expect(md).toContain(line);
    }
    const order = [
      "## Failed image downloads", "## Unparsed attribute values", "## Partially parsed attribute values",
      "## Material fallbacks", "## Default colour set by rule", "## Merged colours", "## Shared articles",
      "## Slug collisions", "## Skipped images", "## Packaging notes", "## Alt texts to review",
    ].map((heading) => md.indexOf(heading));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("omits empty sections, the summary without stats and the result without counts", () => {
    const md = renderReport({
      generatedAt: new Date("2026-10-09T10:00:00.000Z"),
      mode: "dry-run",
      outcome: "dry run — nothing written",
      stats: null,
      findings: [{ kind: "unparsed_attribute", articleNumber: "98020", text: "Ø 12 mm" }],
      result: null,
    });
    expect(md).toContain("- Mode: dry run");
    expect(md).toContain("## Unparsed attribute values\n\n1 entries.");
    expect(md).not.toContain("## Summary");
    expect(md).not.toContain("## Database result");
    expect(md).not.toContain("## Merged colours");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/import/report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`scripts/import/report.mts`:

```ts
import { writeFile } from "node:fs/promises";
import type { Finding } from "./findings.mts";
import type { CatalogStats } from "./map/index.mts";

export type ReportInput = {
  generatedAt: Date;
  mode: "dry-run" | "import";
  outcome: string;
  stats: CatalogStats | null;
  findings: readonly Finding[];
  result: Readonly<Record<string, unknown>> | null;
};

const SECTIONS: readonly { kind: Finding["kind"]; title: string }[] = [
  { kind: "failed_image", title: "Failed image downloads" },
  { kind: "unparsed_attribute", title: "Unparsed attribute values" },
  { kind: "partial_attribute", title: "Partially parsed attribute values" },
  { kind: "material_fallback", title: "Material fallbacks" },
  { kind: "default_color_by_rule", title: "Default colour set by rule" },
  { kind: "merged_color", title: "Merged colours" },
  { kind: "shared_article", title: "Shared articles" },
  { kind: "slug_collision", title: "Slug collisions" },
  { kind: "skipped_image", title: "Skipped images" },
  { kind: "packaging_note", title: "Packaging notes" },
  { kind: "alt_text_review", title: "Alt texts to review" },
];

function line(f: Finding): string {
  switch (f.kind) {
    case "failed_image":
      return `- \`${f.storagePath}\` ← ${f.url}: ${f.reason}`;
    case "unparsed_attribute":
      return `- ${f.articleNumber}: \`${f.text}\``;
    case "partial_attribute":
      return `- ${f.articleNumber}: \`${f.text}\` → note \`${f.remainder}\``;
    case "material_fallback":
      return `- product ${f.legacyProductId}: \`${f.text}\``;
    case "default_color_by_rule":
      return `- product ${f.legacyProductId}: suffix \`${f.suffix}\``;
    case "merged_color":
      return `- \`${f.name}\` ${f.hex}: ${f.legacyColorIds.join(", ")}`;
    case "shared_article":
      return `- ${f.articleNumber}: home product ${f.homeLegacyProductId}, accessory of ${f.accessoryLegacyProductIds.join(", ")}`;
    case "slug_collision":
      return `- product ${f.legacyProductId}: \`${f.slug}\` (${f.level === "subtitle" ? "name + subtitle" : "name + legacy id"})`;
    case "skipped_image":
      return `- product ${f.legacyProductId}: \`${f.reference}\``;
    case "packaging_note":
      return `- ${f.articleNumber}: \`${f.text}\``;
    case "alt_text_review":
      return `- \`${f.storagePath}\``;
  }
}

export function renderReport(input: ReportInput): string {
  const out: string[] = [
    "# Import report",
    "",
    `- Generated: ${input.generatedAt.toISOString()}`,
    `- Mode: ${input.mode === "dry-run" ? "dry run" : "import"}`,
    `- Outcome: ${input.outcome}`,
  ];
  if (input.stats !== null) {
    const s = input.stats;
    out.push(
      "", "## Summary", "", "| Item | Count |", "| --- | --- |",
      `| Products | ${s.products} |`, `| Articles | ${s.articles} |`,
      `| Accessory links | ${s.accessories} |`, `| Colours | ${s.colors} |`,
      `| Materials | ${s.materials} |`, `| Attributes | ${s.attributes} |`,
      `| Images | ${s.images} |`,
      `| Typed description fragments | ${s.typedFragments} of ${s.fragments} |`
    );
  }
  if (input.result !== null) {
    out.push("", "## Database result", "", "| Key | Value |", "| --- | --- |");
    for (const [key, value] of Object.entries(input.result)) out.push(`| ${key} | ${String(value)} |`);
  }
  for (const section of SECTIONS) {
    const entries = input.findings.filter((f) => f.kind === section.kind);
    if (entries.length === 0) continue;
    out.push("", `## ${section.title}`, "", `${entries.length} entries.`, "", ...entries.map(line));
  }
  return `${out.join("\n")}\n`;
}

export async function writeReport(path: string, input: ReportInput): Promise<void> {
  await writeFile(path, renderReport(input), "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/import/report.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/report.mts tests/import/report.test.ts
git commit -m "feat(import): markdown import report"
```

---

### Task 9: Env schema and image pipeline (FR-1 env part, FR-7 I/O part)

**Files:**
- Create: `scripts/import/env.mts`, `scripts/import/images.mts`, `tests/import/png.ts`
- Modify: `package.json` (add `image-size` as dev dependency via `pnpm add -D image-size@^2`)
- Test: `tests/import/env.test.ts`, `tests/import/images.test.ts`

**Interfaces:**
- Consumes: `Result` (Task 1), `MediaDraft` (Task 6)
- Produces:
  - `type ImportEnv = { IMPORT_SUPABASE_URL: string; IMPORT_SUPABASE_SECRET_KEY: string; IMPORT_IMAGE_BASE_URL: string }`, `type RemoveEnv = Omit<ImportEnv, "IMPORT_IMAGE_BASE_URL">`
  - `parseImportEnv(source: Record<string, string | undefined>): Result<ImportEnv, string>`
  - `parseRemoveEnv(source: Record<string, string | undefined>): Result<RemoveEnv, string>`
  - `type ImageJob = { url: string; storagePath: string; contentType: string }`
  - `type FetchedImage = ImageJob & { bytes: Uint8Array; width: number; height: number }`
  - `type ImageFailure = { url: string; storagePath: string; reason: string }`
  - `type StorageBucket` (structural subset of a supabase-js bucket, see code)
  - `fetchImages(jobs: readonly ImageJob[], fetchFn?: typeof fetch, options?: { concurrency?: number; timeoutMs?: number }): Promise<{ fetched: FetchedImage[]; failures: ImageFailure[] }>`
  - `uploadImages(bucket: StorageBucket, images: readonly FetchedImage[]): Promise<Result<number, string>>`
  - `listObjects(bucket: StorageBucket, prefix: string): Promise<Result<string[], string>>`
  - `deleteOrphans(bucket: StorageBucket, keep: ReadonlySet<string>): Promise<Result<number, string>>` — only under `products/`
  - `tests/import/png.ts`: `makePng(width: number, height: number): Buffer`

- [ ] **Step 1: Install the dependency**

Run: `pnpm add -D image-size@^2`
Expected: `package.json` devDependencies contain `"image-size": "^2.…"`.

- [ ] **Step 2: Write the failing tests**

`tests/import/png.ts`:

```ts
import { crc32, deflateSync } from "node:zlib";

/** Smallest valid PNG of the given size (grey pixels). Synthetic test image. */
export function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(0, 9); // greyscale
  const row = Buffer.alloc(width + 1, 0x80);
  row[0] = 0; // filter: none
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
```

`tests/import/env.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseImportEnv, parseRemoveEnv } from "../../scripts/import/env.mts";

const jwt = (role: string) =>
  ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "sig"].join(".");
const base = {
  IMPORT_SUPABASE_URL: "http://127.0.0.1:54321",
  IMPORT_SUPABASE_SECRET_KEY: "sb_secret_abc123",
  IMPORT_IMAGE_BASE_URL: "https://cdn.example.test/base",
};

describe("parseImportEnv (FR-1, SC-1)", () => {
  it("accepts a secret key and a legacy service_role JWT", () => {
    expect(parseImportEnv(base).ok).toBe(true);
    expect(parseImportEnv({ ...base, IMPORT_SUPABASE_SECRET_KEY: jwt("service_role") }).ok).toBe(true);
  });

  it.each([
    ["sb_publishable_abc123"],
    [jwt("anon")],
    ["not-a-key"],
  ])("rejects %s without echoing it", (key) => {
    const result = parseImportEnv({ ...base, IMPORT_SUPABASE_SECRET_KEY: key });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("IMPORT_SUPABASE_SECRET_KEY");
      expect(result.error).not.toContain(key);
    }
  });

  it("rejects missing or invalid URLs", () => {
    const missing = parseImportEnv({ ...base, IMPORT_IMAGE_BASE_URL: undefined });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("IMPORT_IMAGE_BASE_URL");
    expect(parseImportEnv({ ...base, IMPORT_SUPABASE_URL: "ftp://x" }).ok).toBe(false);
  });
});

describe("parseRemoveEnv (FR-12)", () => {
  it("does not need the image base URL", () => {
    expect(parseRemoveEnv({ ...base, IMPORT_IMAGE_BASE_URL: undefined }).ok).toBe(true);
  });
});
```

`tests/import/images.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  deleteOrphans,
  fetchImages,
  listObjects,
  uploadImages,
  type StorageBucket,
} from "../../scripts/import/images.mts";
import { makePng } from "./png";

const job = (name: string) => ({
  url: `https://cdn.test/${name}`,
  storagePath: `products/moebel/p/${name}`,
  contentType: "image/webp",
});

const fakeFetch = (routes: Record<string, Response | Error>): typeof fetch =>
  async (input) => {
    const route = routes[String(input)];
    if (route instanceof Error) throw route;
    return route ?? new Response("not found", { status: 404 });
  };

function fakeBucket(files: string[]) {
  const uploads: string[] = [];
  const removed: string[] = [];
  const bucket: StorageBucket = {
    async upload(path) {
      uploads.push(path);
      return { error: null };
    },
    async list(prefix) {
      const children = new Map<string, boolean>();
      for (const file of files) {
        if (!file.startsWith(`${prefix}/`)) continue;
        const [head, ...rest] = file.slice(prefix.length + 1).split("/");
        if (head !== undefined) children.set(head, rest.length > 0);
      }
      return {
        data: [...children].map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` })),
        error: null,
      };
    },
    async remove(paths) {
      removed.push(...paths);
      return { error: null };
    },
  };
  return { bucket, uploads, removed };
}

describe("fetchImages (FR-7, FR-8)", () => {
  it("reads dimensions and collects failures", async () => {
    const result = await fetchImages(
      [job("a.webp"), job("b.webp"), job("c.webp"), job("d.webp")],
      fakeFetch({
        "https://cdn.test/a.webp": new Response(makePng(40, 30)),
        "https://cdn.test/c.webp": new Response("not an image"),
        "https://cdn.test/d.webp": new Error("socket hang up"),
      })
    );
    expect(result.fetched.map((f) => [f.storagePath, f.width, f.height])).toEqual([
      ["products/moebel/p/a.webp", 40, 30],
    ]);
    expect(result.failures).toEqual([
      { url: "https://cdn.test/b.webp", storagePath: "products/moebel/p/b.webp", reason: "HTTP 404" },
      expect.objectContaining({ storagePath: "products/moebel/p/c.webp" }),
      { url: "https://cdn.test/d.webp", storagePath: "products/moebel/p/d.webp", reason: "socket hang up" },
    ]);
  });

  it("gives up on a hanging request after the timeout", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timed out")));
      });
    const result = await fetchImages([job("a.webp")], hanging, { timeoutMs: 50 });
    expect(result.failures).toHaveLength(1);
  });
});

describe("uploadImages", () => {
  it("uploads every image", async () => {
    const { bucket, uploads } = fakeBucket([]);
    const result = await uploadImages(bucket, [
      { ...job("a.webp"), bytes: makePng(1, 1), width: 1, height: 1 },
    ]);
    expect(result).toEqual({ ok: true, value: 1 });
    expect(uploads).toEqual(["products/moebel/p/a.webp"]);
  });
});

describe("listObjects and deleteOrphans", () => {
  const files = [
    "products/moebel/p/a.webp",
    "products/moebel/p/old.webp",
    "products/wasser/q/b.webp",
  ];

  it("lists nested folders", async () => {
    const { bucket } = fakeBucket(files);
    const result = await listObjects(bucket, "products");
    expect(result.ok && [...result.value].sort()).toEqual([...files].sort());
  });

  it("deletes only objects that are not kept", async () => {
    const { bucket, removed } = fakeBucket(files);
    const result = await deleteOrphans(bucket, new Set(["products/moebel/p/a.webp", "products/wasser/q/b.webp"]));
    expect(result).toEqual({ ok: true, value: 1 });
    expect(removed).toEqual(["products/moebel/p/old.webp"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/import/env.test.ts tests/import/images.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`scripts/import/env.mts`:

```ts
import { z } from "zod";
import { err, ok, type Result } from "./result.mts";

// Reads the `role` claim of a JWT without verifying it (same check as
// lib/env/schema.ts, duplicated because these scripts run on plain Node).
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[\w-]+$/.test(parts[1] ?? "")) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null || !("role" in payload)) return null;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const httpUrl = z.url({ protocol: /^https?$/ });
const secretKey = z
  .string()
  .refine(
    (key) => /^sb_secret_[\w-]+$/.test(key) || jwtRole(key) === "service_role",
    "must be a secret key (sb_secret_…) or a legacy service_role JWT"
  );

const removeEnvSchema = z.object({
  IMPORT_SUPABASE_URL: httpUrl,
  IMPORT_SUPABASE_SECRET_KEY: secretKey,
});
const importEnvSchema = removeEnvSchema.extend({ IMPORT_IMAGE_BASE_URL: httpUrl });

export type ImportEnv = z.infer<typeof importEnvSchema>;
export type RemoveEnv = z.infer<typeof removeEnvSchema>;

function parseWith<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>
): Result<z.infer<S>, string> {
  const result = schema.safeParse(source);
  if (result.success) return ok(result.data);
  // Messages name the variable only; values are never echoed.
  const details = result.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  return err(`Invalid environment variables:\n${details}`);
}

export const parseImportEnv = (source: Record<string, string | undefined>) =>
  parseWith(importEnvSchema, source);
export const parseRemoveEnv = (source: Record<string, string | undefined>) =>
  parseWith(removeEnvSchema, source);
```

Check: Zod's default message for an invalid string must not contain the input; the test enforces it. If `z.url()` includes the value in its message, replace it with a custom message.

`scripts/import/images.mts`:

```ts
import { imageSize } from "image-size";
import { err, ok, type Result } from "./result.mts";

export type ImageJob = { url: string; storagePath: string; contentType: string };
export type FetchedImage = ImageJob & { bytes: Uint8Array; width: number; height: number };
export type ImageFailure = { url: string; storagePath: string; reason: string };

type StorageError = { message: string } | null;
/** The part of a supabase-js storage bucket the importer uses. */
export type StorageBucket = {
  upload(
    path: string,
    body: Uint8Array,
    options: { upsert: boolean; contentType: string }
  ): Promise<{ error: StorageError }>;
  list(
    prefix: string,
    options: { limit: number; offset: number }
  ): Promise<{ data: { name: string; id: string | null }[] | null; error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function fetchOne(job: ImageJob, fetchFn: typeof fetch, timeoutMs: number): Promise<Result<FetchedImage, string>> {
  try {
    const response = await fetchFn(job.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return err(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) return err("empty response");
    const { width, height } = imageSize(bytes);
    return ok({ ...job, bytes, width, height });
  } catch (error: unknown) {
    return err(message(error));
  }
}

export async function fetchImages(
  jobs: readonly ImageJob[],
  fetchFn: typeof fetch = fetch,
  options: { concurrency?: number; timeoutMs?: number } = {}
): Promise<{ fetched: FetchedImage[]; failures: ImageFailure[] }> {
  const concurrency = options.concurrency ?? 6;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetched: FetchedImage[] = [];
  const failures: ImageFailure[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      if (job === undefined) return;
      const result = await fetchOne(job, fetchFn, timeoutMs);
      if (result.ok) fetched.push(result.value);
      else failures.push({ url: job.url, storagePath: job.storagePath, reason: result.error });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  const byPath = (a: { storagePath: string }, b: { storagePath: string }) => a.storagePath.localeCompare(b.storagePath);
  return { fetched: fetched.sort(byPath), failures: failures.sort(byPath) };
}

export async function uploadImages(bucket: StorageBucket, images: readonly FetchedImage[]): Promise<Result<number, string>> {
  for (const image of images) {
    const { error } = await bucket.upload(image.storagePath, image.bytes, { upsert: true, contentType: image.contentType });
    if (error) return err(`upload of ${image.storagePath} failed: ${error.message}`);
  }
  return ok(images.length);
}

const PAGE = 1000;

export async function listObjects(bucket: StorageBucket, prefix: string): Promise<Result<string[], string>> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) return err(`listing ${prefix} failed: ${error.message}`);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      // Storage lists folders as entries without an id.
      if (entry.id === null) {
        const nested = await listObjects(bucket, path);
        if (!nested.ok) return nested;
        paths.push(...nested.value);
      } else {
        paths.push(path);
      }
    }
    if (entries.length < PAGE) return ok(paths);
  }
}

export async function deleteOrphans(bucket: StorageBucket, keep: ReadonlySet<string>): Promise<Result<number, string>> {
  const listed = await listObjects(bucket, "products");
  if (!listed.ok) return listed;
  const orphans = listed.value.filter((path) => !keep.has(path));
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await bucket.remove(orphans.slice(i, i + 100));
    if (error) return err(`deleting orphaned objects failed: ${error.message}`);
  }
  return ok(orphans.length);
}
```

Note: if the real supabase-js `FileObject.id` is typed `string` (not nullable) the structural type still accepts it; at runtime folders carry `id: null`. Verify in Task 11 that `supabase.storage.from("catalog")` is assignable to `StorageBucket` without a cast; if it is not, adapt `StorageBucket` (not the call site).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/import && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/import/env.mts scripts/import/images.mts tests/import
git commit -m "feat(import): env schema and image pipeline"
```

---

### Task 10: Database functions `import_catalog` and `remove_catalog` (FR-9, FR-12 SQL part)

**Files:**
- Create: `supabase/migrations/20261009090000_import_functions.sql`, `supabase/tests/06_import.test.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: payload shape from Task 2 (`ImportPayload`, field names = column names)
- Produces:
  - `public.import_catalog(payload jsonb) returns jsonb` — keys `products`, `articles`, `accessories`, `colors`, `materials`, `attributes`, `media`, `deleted_products`, `deleted_articles`, `deleted_media`
  - `public.remove_catalog() returns jsonb` — keys `products`, `articles`, `media` (counts before deletion)
  - unique index `color_name_hex_idx` on `public.color (name, hex_code)`

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/06_import.test.sql`:

```sql
begin;
select plan(25);

create function pg_temp.payload() returns jsonb language sql as $$
select $j${
  "categories": [{"slug": "moebel", "name": "Möbel", "sort_order": 0}],
  "materials": [{"code": "PA-6", "name": "Polyamid 6"}],
  "attributes": [{"key": "height", "label": "Höhe", "unit": "mm", "data_type": "decimal", "sort_order": 10}],
  "category_attributes": [{"category_slug": "moebel", "attribute_key": "height", "sort_order": 10}],
  "colors": [
    {"name": "testweiß", "ral_reference": "ähnlich RAL 9016", "hex_code": "#F2F5F3", "family": "weiß"},
    {"name": "testbraun", "ral_reference": null, "hex_code": "#5B3A29", "family": "braun"}],
  "media": [{"storage_path": "products/moebel/importkeil/a-98010.webp", "width": 400, "height": 300, "alt_text": "Importkeil"}],
  "products": [
    {"legacy_product_id": 9001, "category_slug": "moebel", "slug": "importkeil", "name": "Importkeil", "subtitle": "für Testschlösser", "description": "Beschreibung.", "material_code": "PA-6", "material_note": null, "sort_order": 10},
    {"legacy_product_id": 9002, "category_slug": "moebel", "slug": "importhalter", "name": "Importhalter", "subtitle": null, "description": null, "material_code": null, "material_note": "A: PA-6 / B: ABS", "sort_order": 20}],
  "articles": [
    {"article_number": "98010", "legacy_product_id": 9001, "name": null, "description": null, "note": null, "sort_order": 1},
    {"article_number": "98011/80", "legacy_product_id": 9001, "name": "Importkeil hoch", "description": null, "note": "abgesetzt", "sort_order": 2},
    {"article_number": "98020", "legacy_product_id": 9002, "name": null, "description": null, "note": null, "sort_order": 1}],
  "article_attributes": [
    {"article_number": "98010", "key": "height", "value_decimal": 8, "value_text": null},
    {"article_number": "98011/80", "key": "height", "value_decimal": 9.5, "value_text": null}],
  "article_packaging": [{"article_number": "98010", "quantity": 500, "sort_order": 0}],
  "product_colors": [
    {"legacy_product_id": 9001, "color_name": "testweiß", "color_hex": "#F2F5F3", "suffix": "0", "is_default": true, "sort_order": 0},
    {"legacy_product_id": 9001, "color_name": "testbraun", "color_hex": "#5B3A29", "suffix": "1", "is_default": false, "sort_order": 1}],
  "product_media": [{"legacy_product_id": 9001, "storage_path": "products/moebel/importkeil/a-98010.webp", "role": "thumbnail", "sort_order": 0}],
  "product_accessories": [{"legacy_product_id": 9002, "article_number": "98010", "sort_order": 0}]
}$j$::jsonb
$$;

-- Privileges (service role only)
select ok(not has_function_privilege('anon', 'public.import_catalog(jsonb)', 'execute'), 'anon cannot execute import_catalog');
select ok(not has_function_privilege('authenticated', 'public.import_catalog(jsonb)', 'execute'), 'authenticated cannot execute import_catalog');
select ok(has_function_privilege('service_role', 'public.import_catalog(jsonb)', 'execute'), 'service_role can execute import_catalog');
select ok(not has_function_privilege('anon', 'public.remove_catalog()', 'execute'), 'anon cannot execute remove_catalog');
select ok(not has_function_privilege('authenticated', 'public.remove_catalog()', 'execute'), 'authenticated cannot execute remove_catalog');
select ok(has_function_privilege('service_role', 'public.remove_catalog()', 'execute'), 'service_role can execute remove_catalog');

-- First import
set local role service_role;
select lives_ok($$select public.import_catalog(pg_temp.payload())$$, 'a valid payload imports');
reset role;

select is((select count(*) from public.product where legacy_product_id in (9001, 9002)), 2::bigint, 'two products imported');
select is((select status::text from public.product where legacy_product_id = 9001), 'published', 'new products are published');
select results_eq(
  $$select a.article_number from public.article a join public.product p on p.id = a.product_id
    where p.legacy_product_id is not null order by a.article_number$$,
  $$values ('98010'), ('98011/80'), ('98020')$$,
  'article numbers imported unchanged');
select is((select count(*) from public.product_accessory pa join public.product p on p.id = pa.product_id where p.legacy_product_id = 9002),
  1::bigint, 'shared article becomes an accessory');
select is((select aa.value_decimal from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '98011/80'),
  9.5::numeric, 'attribute value imported');
select is((select count(*) from public.product_color pc join public.product p on p.id = pc.product_id where p.legacy_product_id = 9001 and pc.is_default),
  1::bigint, 'exactly one default colour');

-- Idempotent: same payload, same ids, no new rows
create temp table first_ids as
  select 'product'::text as t, id from public.product
  union all select 'article', id from public.article
  union all select 'media', id from public.media
  union all select 'color', id from public.color;
set local role service_role;
select lives_ok($$select public.import_catalog(pg_temp.payload())$$, 'the same payload imports again');
reset role;
select set_eq(
  $$select 'product'::text, id from public.product
    union all select 'article', id from public.article
    union all select 'media', id from public.media
    union all select 'color', id from public.color$$,
  $$select t, id from first_ids$$,
  'second run keeps all ids and adds no rows');

-- Rows without legacy_product_id (seed) are untouched
select is((select count(*) from public.product where legacy_product_id is null), 5::bigint, 'seed products survive');

-- Invalid payloads roll back
set local role service_role;
select throws_ok(
  $$select public.import_catalog(jsonb_set(jsonb_set(pg_temp.payload(),
      '{articles}', (pg_temp.payload() -> 'articles') - 2),
      '{product_accessories}', '[]'))$$,
  'P0001', null, 'a product without articles fails the cross-check');
reset role;
select is((select count(*) from public.article where article_number in ('98010', '98011/80', '98020')), 3::bigint,
  'the failed import left the articles unchanged');

set local role service_role;
select throws_ok(
  $$select public.import_catalog(jsonb_set(pg_temp.payload(), '{product_colors,1,is_default}', 'true'))$$,
  '23505', null, 'two default colours are rejected');
select throws_ok(
  $$select public.import_catalog(jsonb_set(pg_temp.payload(), '{articles}', '[]'))$$,
  'P0001', null, 'a payload without articles is rejected');
reset role;

-- A product missing from the next payload is deleted with its children
set local role service_role;
select lives_ok(
  $$select public.import_catalog(jsonb_set(jsonb_set(jsonb_set(pg_temp.payload(),
      '{products}', (pg_temp.payload() -> 'products') - 1),
      '{articles}', (pg_temp.payload() -> 'articles') - 2),
      '{product_accessories}', '[]'))$$,
  'a smaller payload imports');
reset role;
select is((select count(*) from public.product where legacy_product_id = 9002), 0::bigint, 'the missing product is deleted');
select is((select count(*) from public.article where article_number = '98020'), 0::bigint, 'its articles are deleted too');

-- Removal
set local role service_role;
select lives_ok($$select public.remove_catalog()$$, 'remove_catalog runs');
reset role;
select is(
  (select (select count(*) from public.category) + (select count(*) from public.attribute)
        + (select count(*) from public.category_attribute) + (select count(*) from public.material)
        + (select count(*) from public.product) + (select count(*) from public.article)
        + (select count(*) from public.article_attribute) + (select count(*) from public.article_packaging)
        + (select count(*) from public.product_accessory) + (select count(*) from public.color)
        + (select count(*) from public.product_color) + (select count(*) from public.media)
        + (select count(*) from public.product_media) + (select count(*) from public.ai_generation)),
  0::bigint, 'every catalog table is empty after removal');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec supabase test db`
Expected: FAIL in `06_import.test.sql` — function `public.import_catalog(jsonb)` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261009090000_import_functions.sql`:

```sql
-- Import and removal (feature 3). Both functions run as the caller (service
-- role, which bypasses RLS) and are not executable by anon or authenticated.

-- Natural key for colours: the importer upserts by (name, hex_code).
create unique index color_name_hex_idx on public.color (name, hex_code);

create function public.import_catalog(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_ids bigint[];
  article_ids bigint[];
  expected integer;
  affected integer;
  deleted_products integer;
  deleted_articles integer;
  deleted_media integer;
  bad text;
begin
  if jsonb_array_length(coalesce(payload -> 'products', '[]')) = 0 then
    raise exception 'import payload contains no products';
  end if;
  if jsonb_array_length(coalesce(payload -> 'articles', '[]')) = 0 then
    raise exception 'import payload contains no articles';
  end if;

  -- 1. Stale imported rows go first, so their slugs and numbers are free.
  delete from public.product p
  where p.legacy_product_id is not null
    and p.legacy_product_id not in (
      select (x ->> 'legacy_product_id')::integer from jsonb_array_elements(payload -> 'products') x);
  get diagnostics deleted_products = row_count;

  delete from public.article a
  using public.product p
  where a.product_id = p.id
    and p.legacy_product_id is not null
    and a.article_number not in (
      select x ->> 'article_number' from jsonb_array_elements(payload -> 'articles') x);
  get diagnostics deleted_articles = row_count;

  -- 2. Reference data by natural key. Fields the importer does not own
  --    (intro texts, SEO, alt texts once set) are not overwritten.
  insert into public.category (slug, name, sort_order)
  select c.slug, c.name, c.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'categories', '[]')) as c(slug text, name text, sort_order integer)
  on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

  insert into public.material (code, name)
  select m.code, m.name
  from jsonb_to_recordset(coalesce(payload -> 'materials', '[]')) as m(code text, name text)
  on conflict (code) do update set name = excluded.name;

  insert into public.attribute (key, label, unit, data_type, sort_order)
  select a.key, a.label, a.unit, a.data_type, a.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'attributes', '[]'))
    as a(key text, label text, unit text, data_type public.attribute_data_type, sort_order integer)
  on conflict (key) do update
    set label = excluded.label, unit = excluded.unit, data_type = excluded.data_type, sort_order = excluded.sort_order;

  insert into public.color (name, ral_reference, hex_code, family)
  select c.name, c.ral_reference, c.hex_code, c.family
  from jsonb_to_recordset(coalesce(payload -> 'colors', '[]'))
    as c(name text, ral_reference text, hex_code text, family text)
  on conflict (name, hex_code) do update set ral_reference = excluded.ral_reference, family = excluded.family;

  insert into public.media (storage_path, width, height, alt_text)
  select m.storage_path, m.width, m.height, m.alt_text
  from jsonb_to_recordset(coalesce(payload -> 'media', '[]'))
    as m(storage_path text, width integer, height integer, alt_text text)
  on conflict (storage_path) do update set width = excluded.width, height = excluded.height;

  -- 3. Products and articles. New products are published; status, SEO and
  --    origin fields of existing products are kept.
  insert into public.product
    (category_id, slug, name, subtitle, description, material_id, material_note, status, sort_order, legacy_product_id)
  select cat.id, p.slug, p.name, p.subtitle, p.description, mat.id, p.material_note, 'published', p.sort_order, p.legacy_product_id
  from jsonb_to_recordset(payload -> 'products') as p(
    legacy_product_id integer, category_slug text, slug text, name text, subtitle text,
    description text, material_code text, material_note text, sort_order integer)
  join public.category cat on cat.slug = p.category_slug
  left join public.material mat on mat.code = p.material_code
  on conflict (legacy_product_id) do update set
    category_id = excluded.category_id, slug = excluded.slug, name = excluded.name,
    subtitle = excluded.subtitle, description = excluded.description, material_id = excluded.material_id,
    material_note = excluded.material_note, sort_order = excluded.sort_order;

  select coalesce(array_agg(p.id), '{}') into product_ids
  from public.product p
  where p.legacy_product_id in (
    select (x ->> 'legacy_product_id')::integer from jsonb_array_elements(payload -> 'products') x);

  insert into public.article (product_id, article_number, name, description, note, sort_order)
  select pr.id, a.article_number, a.name, a.description, a.note, a.sort_order
  from jsonb_to_recordset(payload -> 'articles') as a(
    article_number text, legacy_product_id integer, name text, description text, note text, sort_order integer)
  join public.product pr on pr.legacy_product_id = a.legacy_product_id
  on conflict (article_number) do update set
    product_id = excluded.product_id, name = excluded.name, description = excluded.description,
    note = excluded.note, sort_order = excluded.sort_order;

  select coalesce(array_agg(a.id), '{}') into article_ids
  from public.article a
  where a.article_number in (select x ->> 'article_number' from jsonb_array_elements(payload -> 'articles') x);

  -- 4. Children are rewritten; every insert must use all payload rows.
  delete from public.article_attribute where article_id = any (article_ids);
  insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text)
  select ar.id, at.id, v.value_decimal, v.value_text
  from jsonb_to_recordset(coalesce(payload -> 'article_attributes', '[]'))
    as v(article_number text, key text, value_decimal numeric, value_text text)
  join public.article ar on ar.article_number = v.article_number
  join public.attribute at on at.key = v.key;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'article_attributes', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % article attributes could be linked', affected, expected;
  end if;

  delete from public.article_packaging where article_id = any (article_ids);
  insert into public.article_packaging (article_id, quantity, sort_order)
  select ar.id, v.quantity, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'article_packaging', '[]'))
    as v(article_number text, quantity integer, sort_order integer)
  join public.article ar on ar.article_number = v.article_number;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'article_packaging', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % packaging rows could be linked', affected, expected;
  end if;

  delete from public.product_color where product_id = any (product_ids);
  insert into public.product_color (product_id, color_id, suffix, is_default, sort_order)
  select pr.id, c.id, v.suffix, v.is_default, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_colors', '[]'))
    as v(legacy_product_id integer, color_name text, color_hex text, suffix text, is_default boolean, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.color c on c.name = v.color_name and c.hex_code = v.color_hex;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_colors', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % product colours could be linked', affected, expected;
  end if;

  delete from public.product_media where product_id = any (product_ids);
  insert into public.product_media (product_id, media_id, role, sort_order)
  select pr.id, m.id, v.role, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_media', '[]'))
    as v(legacy_product_id integer, storage_path text, role public.media_role, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.media m on m.storage_path = v.storage_path;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_media', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % product media could be linked', affected, expected;
  end if;

  delete from public.product_accessory where product_id = any (product_ids);
  insert into public.product_accessory (product_id, article_id, sort_order)
  select pr.id, ar.id, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_accessories', '[]'))
    as v(legacy_product_id integer, article_number text, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.article ar on ar.article_number = v.article_number;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_accessories', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % accessories could be linked', affected, expected;
  end if;

  delete from public.category_attribute ca
  using public.category c
  where ca.category_id = c.id
    and c.slug in (select x ->> 'slug' from jsonb_array_elements(coalesce(payload -> 'categories', '[]')) x);
  insert into public.category_attribute (category_id, attribute_id, sort_order)
  select c.id, at.id, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'category_attributes', '[]'))
    as v(category_slug text, attribute_key text, sort_order integer)
  join public.category c on c.slug = v.category_slug
  join public.attribute at on at.key = v.attribute_key;

  -- Media of the import area that no product uses any more.
  delete from public.media m
  where m.storage_path like 'products/%'
    and not exists (select 1 from public.product_media pm where pm.media_id = m.id);
  get diagnostics deleted_media = row_count;

  -- 5. Cross-checks; any failure rolls back the whole import.
  if cardinality(product_ids) <> jsonb_array_length(payload -> 'products') then
    raise exception 'cross-check failed: % of % products imported',
      cardinality(product_ids), jsonb_array_length(payload -> 'products');
  end if;
  if cardinality(article_ids) <> jsonb_array_length(payload -> 'articles') then
    raise exception 'cross-check failed: % of % articles imported',
      cardinality(article_ids), jsonb_array_length(payload -> 'articles');
  end if;

  select string_agg(p.legacy_product_id::text, ', ' order by p.legacy_product_id) into bad
  from public.product p
  where p.id = any (product_ids)
    and not exists (select 1 from public.article a where a.product_id = p.id);
  if bad is not null then
    raise exception 'cross-check failed: products without articles: %', bad;
  end if;

  select string_agg(p.legacy_product_id::text, ', ' order by p.legacy_product_id) into bad
  from public.product p
  where p.id = any (product_ids)
    and exists (select 1 from public.product_color pc where pc.product_id = p.id)
    and (select count(*) from public.product_color pc where pc.product_id = p.id and pc.is_default) <> 1;
  if bad is not null then
    raise exception 'cross-check failed: products without exactly one default colour: %', bad;
  end if;

  return jsonb_build_object(
    'products', cardinality(product_ids),
    'articles', cardinality(article_ids),
    'accessories', jsonb_array_length(coalesce(payload -> 'product_accessories', '[]')),
    'colors', jsonb_array_length(coalesce(payload -> 'colors', '[]')),
    'materials', jsonb_array_length(coalesce(payload -> 'materials', '[]')),
    'attributes', jsonb_array_length(coalesce(payload -> 'attributes', '[]')),
    'media', jsonb_array_length(coalesce(payload -> 'media', '[]')),
    'deleted_products', deleted_products,
    'deleted_articles', deleted_articles,
    'deleted_media', deleted_media);
end;
$$;

create function public.remove_catalog()
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
    'media', (select count(*) from public.media));
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
  return counts;
end;
$$;

revoke execute on function public.import_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.import_catalog(jsonb) to service_role;
revoke execute on function public.remove_catalog() from public, anon, authenticated;
grant execute on function public.remove_catalog() to service_role;
```

- [ ] **Step 4: Apply and run the tests**

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: all pgTAP files pass, incl. `06_import.test.sql` (25 tests). If the plan count differs because a check was split, fix `select plan(n)` to the real number — never drop a check.

- [ ] **Step 5: Regenerate types**

Run: `pnpm db:types && git diff --stat lib/supabase/database.types.ts`
Expected: `Functions` now contains `import_catalog` (`Args: { payload: Json }`, `Returns: Json`) and `remove_catalog`.

- [ ] **Step 6: Run the whole check**

Run: `pnpm typecheck && pnpm db:test`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261009090000_import_functions.sql supabase/tests/06_import.test.sql lib/supabase/database.types.ts
git commit -m "feat(db): atomic import_catalog and remove_catalog functions"
```

---

### Task 11: Import CLI and integration tests (FR-1, FR-8, FR-10, SC-7 int)

**Files:**
- Create: `scripts/import/cli.mts`, `tests/integration/import-helpers.ts`, `tests/integration/import.test.ts`, `tests/fixtures/import/snapshot/{products,articles,colors,product_colors_connection}.json`
- Modify: `package.json` (scripts), `vitest.integration.config.mts` (secret key env, hook timeout)

**Interfaces:**
- Consumes: everything above
- Produces:
  - `type CliIo = { env: Record<string, string | undefined>; log: (line: string) => void; error: (line: string) => void; fetch?: typeof fetch; now?: () => Date }`
  - `runImportCli(argv: readonly string[], io: CliIo): Promise<number>` — exit code: `0` success, `1` failure, `2` usage
  - Helpers: `startImageServer(files: ReadonlyMap<string, Buffer>): Promise<{ baseUrl: string; close: () => Promise<void> }>`, `copyFixtureSnapshot(): Promise<string>`, `serviceClient(): SupabaseClient<Database>`, `importEnv(baseUrl: string): Record<string, string>`, `resetDatabase(): Promise<void>`, `tableCounts(): Promise<Record<string, number>>`, `silentIo(env): CliIo & { lines: string[] }`

- [ ] **Step 1: Add scripts and integration config**

In `package.json` `scripts` add:

```json
"catalog:import": "node --env-file-if-exists=.env.import scripts/import/cli.mts",
"catalog:remove": "node --env-file-if-exists=.env.import scripts/import/remove.mts",
```

In `vitest.integration.config.mts`: also require `SECRET_KEY` (string) from `supabase status -o json`, extend the error check accordingly, add to `test.env`:

```ts
IMPORT_SUPABASE_URL: status.API_URL,
IMPORT_SUPABASE_SECRET_KEY: status.SECRET_KEY,
```

and set `hookTimeout: 120_000` (database reset in `afterAll`).

- [ ] **Step 2: Create the synthetic fixture snapshot**

`tests/fixtures/import/snapshot/products.json`:

```json
[
  {
    "_id": { "$oid": "000000000000000000009001" },
    "product_id": 9001,
    "prio": 10000,
    "category": "moebel",
    "name": "Testkeil mit Dämpfung",
    "description1": "für Testschlösser",
    "description2": "Gedämpfter Testkeil für Schubladen.",
    "description3": null,
    "description4": null,
    "material": "PA-6 (temperaturbeständig bis 100° C)",
    "imageUrls_small": ["/a_98010-Testkeil.webp"],
    "imageUrls_big": ["/b1_98010-Testkeil.webp"],
    "createdAt": { "$date": "2024-11-23T00:00:00.000Z" },
    "updatedAt": { "$date": "2024-11-23T00:00:00.000Z" }
  },
  {
    "_id": { "$oid": "000000000000000000009002" },
    "product_id": 9002,
    "prio": 20000,
    "category": "halterung",
    "name": "Testhalter",
    "description1": "",
    "description2": null,
    "material": "Wandteile: PA-6 / Blendenteile: ABS",
    "imageUrls_small": ["/a_98020 Testhalter.webp"],
    "imageUrls_big": []
  },
  {
    "_id": { "$oid": "000000000000000000009003" },
    "product_id": 9003,
    "prio": 30000,
    "category": "wasser",
    "name": "Testsiphon",
    "description1": "für Testbecken",
    "material": "TPE",
    "imageUrls_small": [],
    "imageUrls_big": []
  }
]
```

`tests/fixtures/import/snapshot/articles.json`:

```json
[
  { "product_id": 9001, "number": "98010", "prio": 10000, "name": "Testkeil mit Dämpfung", "description1": "Höhe 8 mm", "vpe1": "500", "vpe2": "100" },
  { "product_id": 9001, "number": "98011/80", "prio": 11000, "name": "Testkeil hoch", "description1": "Höhe 9,5 mm abgesetzt" },
  { "product_id": 9002, "number": "98020", "prio": 10000, "name": "Testhalter", "description1": "Ø 12 mm", "vpe1": "wird passend verpackt" },
  { "product_id": 9003, "number": "98030", "prio": 10000, "name": "Testsiphon", "description1": "für Schlauch Ø 10 mm", "description2": "Für die Montage wird ein Testwerkzeug benötigt." },
  { "product_id": 9003, "number": "98010", "prio": 12000, "name": "Testkeil mit Dämpfung", "description1": "Höhe 8 mm" }
]
```

`tests/fixtures/import/snapshot/colors.json`:

```json
[
  { "color_id": "1-1", "name": "testweiß (ähnlich RAL 9016)", "code": "#F2F5F3" },
  { "color_id": "3-1", "name": "testbraun", "code": "#5B3A29" },
  { "color_id": "4-1", "name": "testgrau", "code": "#8A8D8F" },
  { "color_id": "4-2", "name": "testgrau", "code": "#8A8D8F" },
  { "color_id": "9-9", "name": "ungenutzt", "code": "#FF8800" }
]
```

`tests/fixtures/import/snapshot/product_colors_connection.json`:

```json
[
  { "product_id": 9001, "color_id": "1-1", "color_suffix": 0 },
  { "product_id": 9001, "color_id": "3-1", "color_suffix": 1 },
  { "product_id": 9001, "color_id": "4-1", "color_suffix": 2 },
  { "product_id": 9002, "color_id": "3-1", "color_suffix": 2 },
  { "product_id": 9002, "color_id": "4-2", "color_suffix": 1 }
]
```

Images served by the test server (synthetic PNG bytes, names as the CDN would have them):
`a_98010-Testkeil.webp` 40×30, `b1_98010-Testkeil.webp` 80×60, `a_98020_Testhalter.webp` 50×50.
Expected storage paths:
`products/moebel/testkeil-mit-daempfung/a-98010-testkeil.webp`,
`products/moebel/testkeil-mit-daempfung/b1-98010-testkeil.webp`,
`products/halterung/testhalter/a-98020-testhalter.webp`.

- [ ] **Step 3: Write the helpers and the failing integration tests**

`tests/integration/import-helpers.ts`:

```ts
import { execSync } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CliIo } from "../../scripts/import/cli.mts";
import { makePng } from "../import/png";

export const FIXTURE_IMAGES: ReadonlyMap<string, Buffer> = new Map([
  ["a_98010-Testkeil.webp", makePng(40, 30)],
  ["b1_98010-Testkeil.webp", makePng(80, 60)],
  ["a_98020_Testhalter.webp", makePng(50, 50)],
]);

export const CATALOG_TABLES = [
  "category", "attribute", "category_attribute", "material", "product", "article",
  "article_attribute", "article_packaging", "product_accessory", "color",
  "product_color", "media", "product_media", "ai_generation",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see vitest.integration.config.mts)`);
  return value;
}

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(requireEnv("IMPORT_SUPABASE_URL"), requireEnv("IMPORT_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function importEnv(baseUrl: string): Record<string, string> {
  return {
    IMPORT_SUPABASE_URL: requireEnv("IMPORT_SUPABASE_URL"),
    IMPORT_SUPABASE_SECRET_KEY: requireEnv("IMPORT_SUPABASE_SECRET_KEY"),
    IMPORT_IMAGE_BASE_URL: baseUrl,
  };
}

export function silentIo(env: Record<string, string | undefined>): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return { env, lines, log: (line) => lines.push(line), error: (line) => lines.push(line) };
}

export async function startImageServer(files: ReadonlyMap<string, Buffer>) {
  const server = createServer((request, response) => {
    const name = decodeURIComponent((request.url ?? "").split("/").pop() ?? "");
    const body = files.get(name);
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "image/png" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo; // listen() on TCP always yields AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}/cdn/folder`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function copyFixtureSnapshot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "import-snapshot-"));
  await cp(join(process.cwd(), "tests/fixtures/import/snapshot"), dir, { recursive: true });
  return dir;
}

export async function tableCounts(client = serviceClient()): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of CATALOG_TABLES) {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

/** Restores migrations + seed and waits until the API answers again. */
export async function resetDatabase(): Promise<void> {
  execSync("pnpm exec supabase db reset", { stdio: "ignore" });
  const client = serviceClient();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { error } = await client.from("category").select("id").limit(1);
    if (!error) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not come back after db reset");
}
```

Note: the one cast (`as AddressInfo`) is commented; `server.address()` returns `string | AddressInfo | null` and is an `AddressInfo` for TCP listeners.

`tests/integration/import.test.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runImportCli } from "../../scripts/import/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import {
  FIXTURE_IMAGES, copyFixtureSnapshot, importEnv, resetDatabase,
  serviceClient, silentIo, startImageServer, tableCounts,
} from "./import-helpers";

const PATHS = [
  "products/halterung/testhalter/a-98020-testhalter.webp",
  "products/moebel/testkeil-mit-daempfung/a-98010-testkeil.webp",
  "products/moebel/testkeil-mit-daempfung/b1-98010-testkeil.webp",
];

let server: Awaited<ReturnType<typeof startImageServer>>;
const client = serviceClient();
const bucket = () => client.storage.from("catalog");

async function storedPaths(): Promise<string[]> {
  const listed = await listObjects(bucket(), "products");
  if (!listed.ok) throw new Error(listed.error);
  return [...listed.value].sort();
}

beforeAll(async () => {
  server = await startImageServer(FIXTURE_IMAGES);
});

afterAll(async () => {
  await server.close();
  const listed = await listObjects(bucket(), "products");
  if (listed.ok && listed.value.length > 0) await bucket().remove(listed.value);
  await resetDatabase();
});

describe("catalog:import (FR-1, FR-8, SC-1, SC-8)", () => {
  it("refuses to run without valid env", async () => {
    const before = await tableCounts();
    const io = silentIo({ ...importEnv(server.baseUrl), IMPORT_SUPABASE_SECRET_KEY: "sb_publishable_x" });
    expect(await runImportCli(["--snapshot", await copyFixtureSnapshot()], io)).toBe(1);
    expect(await tableCounts()).toEqual(before);
  });

  it("prints usage without --snapshot", async () => {
    expect(await runImportCli([], silentIo(importEnv(server.baseUrl)))).toBe(2);
  });

  it("dry run writes the report and changes nothing", async () => {
    const dir = await copyFixtureSnapshot();
    const before = await tableCounts();
    const code = await runImportCli(["--", "--snapshot", dir, "--dry-run"], silentIo(importEnv(server.baseUrl)));
    expect(code).toBe(0);
    expect(await tableCounts()).toEqual(before);
    expect(await storedPaths()).toEqual([]);
    const report = await readFile(join(dir, "import-report.md"), "utf8");
    expect(report).toContain("- Mode: dry run");
    expect(report).toContain("## Unparsed attribute values");
  });

  it("aborts on an empty collection without writing", async () => {
    const dir = await copyFixtureSnapshot();
    await writeFile(join(dir, "articles.json"), "[]");
    const before = await tableCounts();
    expect(await runImportCli(["--snapshot", dir], silentIo(importEnv(server.baseUrl)))).toBe(1);
    expect(await tableCounts()).toEqual(before);
  });

  it("aborts on a missing image, writes the report and changes nothing", async () => {
    const dir = await copyFixtureSnapshot();
    const products = JSON.parse(await readFile(join(dir, "products.json"), "utf8"));
    products[2].imageUrls_small = ["/a_98030-Fehlt.webp"];
    await writeFile(join(dir, "products.json"), JSON.stringify(products));
    const before = await tableCounts();
    expect(await runImportCli(["--snapshot", dir], silentIo(importEnv(server.baseUrl)))).toBe(1);
    expect(await tableCounts()).toEqual(before);
    const report = await readFile(join(dir, "import-report.md"), "utf8");
    expect(report).toContain("## Failed image downloads");
    expect(report).toContain("a-98030-fehlt.webp");
  });

  it("aborts when the database rejects the payload, then succeeds on a re-run (Review Focus 4)", async () => {
    const { data: category } = await client.from("category").insert({ slug: "moebel", name: "Möbel" }).select("id").single();
    expect(category).not.toBeNull();
    const blocker = await client
      .from("product")
      .insert({ category_id: category?.id ?? 0, slug: "testkeil-mit-daempfung", name: "Blocker" })
      .select("id")
      .single();
    expect(blocker.error).toBeNull();
    const before = await tableCounts();
    const dir = await copyFixtureSnapshot();
    const io = silentIo(importEnv(server.baseUrl));
    expect(await runImportCli(["--snapshot", dir], io)).toBe(1);
    expect(await tableCounts()).toEqual(before);
    expect(await readFile(join(dir, "import-report.md"), "utf8")).toContain("- Outcome: aborted");

    await client.from("product").delete().eq("id", blocker.data?.id ?? 0);
    expect(await runImportCli(["--snapshot", dir], silentIo(importEnv(server.baseUrl)))).toBe(0);
    expect(await storedPaths()).toEqual(PATHS);
  });
});

describe("catalog:import result (FR-7, FR-9, SC-7, SC-8)", () => {
  it("imports products, articles, colours and images", async () => {
    const io = silentIo(importEnv(server.baseUrl));
    expect(await runImportCli(["--snapshot", await copyFixtureSnapshot()], io)).toBe(0);
    expect(io.lines.join("\n")).toContain("products: 3");

    const { data: products } = await client.from("product").select("legacy_product_id, slug, status").not("legacy_product_id", "is", null).order("legacy_product_id");
    expect(products).toEqual([
      { legacy_product_id: 9001, slug: "testkeil-mit-daempfung", status: "published" },
      { legacy_product_id: 9002, slug: "testhalter", status: "published" },
      { legacy_product_id: 9003, slug: "testsiphon", status: "published" },
    ]);
    const { data: media } = await client.from("media").select("storage_path, width, height").like("storage_path", "products/%/%/%").order("storage_path");
    expect(media).toEqual([
      { storage_path: PATHS[0], width: 50, height: 50 },
      { storage_path: PATHS[1], width: 40, height: 30 },
      { storage_path: PATHS[2], width: 80, height: 60 },
    ]);
    expect(await storedPaths()).toEqual(PATHS);
    const { data: variants } = await client.from("variant").select("order_number").like("order_number", "98010%").order("order_number");
    expect(variants?.map((v) => v.order_number)).toEqual(["98010 - 0", "98010 - 1", "98010 - 2"]);
  });
});

describe("re-import semantics (FR-10, SC-10)", () => {
  it("keeps owned-elsewhere fields, restores imported fields, keeps ids and removes orphans", async () => {
    const dir = await copyFixtureSnapshot();
    expect(await runImportCli(["--snapshot", dir], silentIo(importEnv(server.baseUrl)))).toBe(0);
    const { data: before } = await client.from("product").select("id, legacy_product_id").not("legacy_product_id", "is", null).order("legacy_product_id");

    await client.from("product").update({ status: "archived", name: "Verändert" }).eq("legacy_product_id", 9001);
    await client.from("category").update({ intro_text: "Redaktioneller Text." }).eq("slug", "moebel");
    await bucket().upload("products/moebel/alt/verwaist.webp", FIXTURE_IMAGES.get("a_98010-Testkeil.webp") ?? Buffer.alloc(0), { upsert: true, contentType: "image/webp" });

    expect(await runImportCli(["--snapshot", dir], silentIo(importEnv(server.baseUrl)))).toBe(0);

    const { data: after } = await client.from("product").select("id, legacy_product_id").not("legacy_product_id", "is", null).order("legacy_product_id");
    expect(after).toEqual(before);
    const { data: keil } = await client.from("product").select("status, name").eq("legacy_product_id", 9001).single();
    expect(keil).toEqual({ status: "archived", name: "Testkeil mit Dämpfung" });
    const { data: moebel } = await client.from("category").select("intro_text").eq("slug", "moebel").single();
    expect(moebel?.intro_text).toBe("Redaktioneller Text.");
    expect(await storedPaths()).toEqual(PATHS);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm db:test`
Expected: FAIL — `scripts/import/cli.mts` not found.

- [ ] **Step 5: Implement the CLI**

`scripts/import/cli.mts`:

```ts
// Imports the legacy catalog from a local snapshot directory.
// Usage: pnpm catalog:import --snapshot <dir> [--dry-run]
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { parseImportEnv } from "./env.mts";
import type { Finding } from "./findings.mts";
import { deleteOrphans, fetchImages, uploadImages } from "./images.mts";
import { completePayload, mapSnapshot, type CatalogStats } from "./map/index.mts";
import { writeReport } from "./report.mts";
import { readSnapshot } from "./snapshot.mts";

export type CliIo = {
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  fetch?: typeof fetch;
  now?: () => Date;
};

const USAGE = "usage: pnpm catalog:import --snapshot <dir> [--dry-run]";

export async function runImportCli(argv: readonly string[], io: CliIo): Promise<number> {
  let snapshotDir: string | undefined;
  let dryRun = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { snapshot: { type: "string" }, "dry-run": { type: "boolean" } },
      strict: true,
    });
    snapshotDir = values.snapshot;
    dryRun = values["dry-run"] ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (snapshotDir === undefined) {
    io.error(USAGE);
    return 2;
  }

  const env = parseImportEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const snapshot = await readSnapshot(snapshotDir);
  if (!snapshot.ok) {
    io.error(`Snapshot rejected: ${snapshot.error.message}`);
    return 1;
  }
  const mapped = mapSnapshot(snapshot.value, { imageBaseUrl: env.value.IMPORT_IMAGE_BASE_URL });
  if (!mapped.ok) {
    io.error(`Invalid data: ${mapped.error.message}`);
    return 1;
  }

  const reportPath = join(snapshotDir, "import-report.md");
  const now = io.now ?? (() => new Date());
  const report = async (
    outcome: string,
    findings: readonly Finding[],
    stats: CatalogStats,
    result: Record<string, unknown> | null = null
  ) => {
    await writeReport(reportPath, {
      generatedAt: now(),
      mode: dryRun ? "dry-run" : "import",
      outcome,
      stats,
      findings,
      result,
    });
    io.log(`Report: ${reportPath}`);
  };
  const { findings, stats } = mapped.value;

  if (dryRun) {
    await report("dry run — nothing written", findings, stats);
    io.log(`Dry run: ${stats.products} products, ${stats.articles} articles, ${stats.images} images mapped.`);
    return 0;
  }

  const images = await fetchImages(
    mapped.value.media.map((m) => ({ url: m.url, storagePath: m.storage_path, contentType: m.content_type })),
    io.fetch ?? fetch
  );
  if (images.failures.length > 0) {
    const failed: Finding[] = images.failures.map((f) => ({ kind: "failed_image", ...f }));
    await report(`aborted: ${images.failures.length} image download(s) failed`, [...failed, ...findings], stats);
    io.error(`${images.failures.length} image download(s) failed — nothing was written.`);
    return 1;
  }

  const payload = completePayload(
    mapped.value,
    new Map(images.fetched.map((i) => [i.storagePath, { width: i.width, height: i.height }]))
  );
  if (!payload.ok) {
    await report(`aborted: ${payload.error.message}`, findings, stats);
    io.error(payload.error.message);
    return 1;
  }

  const supabase = createClient<Database>(env.value.IMPORT_SUPABASE_URL, env.value.IMPORT_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = supabase.storage.from("catalog");
  const uploaded = await uploadImages(bucket, images.fetched);
  if (!uploaded.ok) {
    await report(`aborted: ${uploaded.error}`, findings, stats);
    io.error(`${uploaded.error} — the database was not changed.`);
    return 1;
  }

  const { data, error } = await supabase.rpc("import_catalog", { payload: payload.value });
  if (error) {
    await report(`aborted: database rejected the import (${error.message})`, findings, stats);
    io.error(`Database rejected the import: ${error.message} — nothing was changed.`);
    return 1;
  }
  const result =
    typeof data === "object" && data !== null && !Array.isArray(data) ? { ...data } : { result: String(data) };

  const orphans = await deleteOrphans(bucket, new Set(payload.value.media.map((m) => m.storage_path)));
  if (!orphans.ok) {
    await report(`imported, but orphan cleanup failed (${orphans.error})`, findings, stats, result);
    io.error(`Imported, but orphan cleanup failed: ${orphans.error}. Re-run the import to finish it.`);
    return 1;
  }

  await report("imported", findings, stats, { ...result, deleted_objects: orphans.value });
  for (const [key, value] of Object.entries(result)) io.log(`${key}: ${String(value)}`);
  io.log(`deleted_objects: ${orphans.value}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runImportCli(process.argv.slice(2), {
    env: process.env,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
  process.exit(code);
}
```

Notes for the implementer:
- `supabase.rpc("import_catalog", { payload: payload.value })` must type-check against the generated `Json` arg type without a cast. `ImportPayload` uses `type` aliases (not interfaces), which TypeScript accepts as `Json`. If it still does not, add a small `toJson(payload: ImportPayload): Json` that does `JSON.parse(JSON.stringify(payload))` with a `Json`-typed return and a comment — no `as`.
- `bucket` must be assignable to `StorageBucket` without a cast (see Task 9 note).
- Top-level `await` is fine (`.mts` = ES module).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm db:test`
Expected: PASS (pgTAP + all integration files). Run it twice in a row to prove the reset leaves the seed intact for `catalog.test.ts`.

- [ ] **Step 7: Run the CLI by hand against the fixture (smoke)**

Run (local stack; keys from `pnpm exec supabase status`):
`IMPORT_SUPABASE_URL=… IMPORT_SUPABASE_SECRET_KEY=… IMPORT_IMAGE_BASE_URL=http://127.0.0.1:9/x pnpm catalog:import --snapshot "$(mktemp -d)" ; echo "exit $?"`
Expected: `Snapshot rejected: products.json is missing …`, `exit 1`, no Node warnings about typeless modules.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/import/cli.mts tests/integration tests/fixtures vitest.integration.config.mts
git commit -m "feat(import): catalog:import CLI with integration tests"
```

---

### Task 12: Removal CLI and placeholder branding (FR-12, FR-13)

**Files:**
- Create: `scripts/import/remove.mts`, `tests/integration/remove.test.ts`
- Modify: `config/branding.ts`, `config/branding.test.ts`

**Interfaces:**
- Consumes: `parseRemoveEnv` (Task 9), `remove_catalog()` (Task 10), helpers (Task 11), `CliIo` (Task 11)
- Produces:
  - `runRemoveCli(argv: readonly string[], io: CliIo): Promise<number>` — `0` removed, `1` refused/failed, `2` usage
  - `placeholderBranding: Branding`

- [ ] **Step 1: Write the failing tests**

Append to `config/branding.test.ts`:

```ts
import { brandingSchema, branding, placeholderBranding } from "./branding";

describe("placeholderBranding (FR-13, SC-13)", () => {
  it("passes the schema", () => {
    expect(brandingSchema.safeParse(placeholderBranding).success).toBe(true);
  });

  it("contains none of the customer strings", () => {
    const serialized = JSON.stringify(placeholderBranding);
    for (const value of [branding.companyName, branding.shortName, branding.officialSiteUrl]) {
      expect(serialized).not.toContain(value);
    }
  });
});
```

(Merge the import with the file's existing imports instead of duplicating it; keep existing tests untouched.)

`tests/integration/remove.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runImportCli } from "../../scripts/import/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import { runRemoveCli } from "../../scripts/import/remove.mts";
import {
  FIXTURE_IMAGES, copyFixtureSnapshot, importEnv, resetDatabase,
  serviceClient, silentIo, startImageServer, tableCounts,
} from "./import-helpers";

let server: Awaited<ReturnType<typeof startImageServer>>;
const client = serviceClient();
const host = () => new URL(process.env.IMPORT_SUPABASE_URL ?? "http://invalid").host;

beforeAll(async () => {
  server = await startImageServer(FIXTURE_IMAGES);
  expect(await runImportCli(["--snapshot", await copyFixtureSnapshot()], silentIo(importEnv(server.baseUrl)))).toBe(0);
});

afterAll(async () => {
  await server.close();
  await resetDatabase();
});

describe("catalog:remove (FR-12, SC-12)", () => {
  it.each([
    [[]],
    [["--confirm", "other.example.test"]],
    [["--confirm", process.env.IMPORT_SUPABASE_URL ?? "x"]],
    [["--confirm", ""]],
  ])("refuses with %j and changes nothing (Review Focus 5)", async (args) => {
    const before = await tableCounts();
    const code = await runRemoveCli(args, silentIo(importEnv(server.baseUrl)));
    expect([1, 2]).toContain(code);
    expect(await tableCounts()).toEqual(before);
  });

  it("removes every catalog row and every object with the right host", async () => {
    const io = silentIo(importEnv(server.baseUrl));
    expect(await runRemoveCli(["--", "--confirm", host()], io)).toBe(0);
    const counts = await tableCounts();
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    const listed = await listObjects(client.storage.from("catalog"), "products");
    expect(listed.ok && listed.value).toEqual([]);
    expect(io.lines.join("\n")).toContain("products:");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run config/branding.test.ts && pnpm db:test`
Expected: FAIL — `placeholderBranding` and `scripts/import/remove.mts` missing.

- [ ] **Step 3: Implement**

In `config/branding.ts`, below `branding`, add:

```ts
// Used on revocation (docs/revocation.md): switch the export above to this
// object, commit and deploy. Contains no customer data.
export const placeholderBranding: Branding = brandingSchema.parse({
  companyName: "Beispiel Kunststoffteile GmbH",
  shortName: "Beispiel",
  officialSiteUrl: "https://example.com",
  previewLabel: "Referenzprojekt (Vorschau mit Beispieldaten)",
  developer: { name: "Eugen Moser", url: "https://eugen-moser.com" },
});
```

`scripts/import/remove.mts`:

```ts
// Deletes every catalog row and every object in the catalog bucket.
// Usage: pnpm catalog:remove --confirm <host of IMPORT_SUPABASE_URL>
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "./cli.mts";
import { parseRemoveEnv } from "./env.mts";

const USAGE = "usage: pnpm catalog:remove --confirm <host of IMPORT_SUPABASE_URL>";

export async function runRemoveCli(argv: readonly string[], io: CliIo): Promise<number> {
  let confirm: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { confirm: { type: "string" } },
      strict: true,
    });
    confirm = values.confirm;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (confirm === undefined) {
    io.error(USAGE);
    return 2;
  }

  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const host = new URL(env.value.IMPORT_SUPABASE_URL).host;
  if (confirm !== host) {
    io.error(`Refusing: --confirm must be exactly "${host}". Nothing was deleted.`);
    return 1;
  }

  const supabase = createClient<Database>(env.value.IMPORT_SUPABASE_URL, env.value.IMPORT_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("remove_catalog");
  if (error) {
    io.error(`Database rejected the removal: ${error.message} — nothing was deleted.`);
    return 1;
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data))
    for (const [key, value] of Object.entries(data)) io.log(`${key}: ${String(value)}`);

  const emptied = await supabase.storage.emptyBucket("catalog");
  if (emptied.error) {
    io.error(`Rows deleted, but emptying the bucket failed: ${emptied.error.message}. Re-run to finish.`);
    return 1;
  }
  io.log("Storage bucket catalog emptied.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runRemoveCli(process.argv.slice(2), {
    env: process.env,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
  process.exit(code);
}
```

Note: the empty `--confirm ""` case gives `confirm === ""` → host mismatch → `1`. A full URL never equals the host → `1`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm db:test && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/remove.mts tests/integration/remove.test.ts config/branding.ts config/branding.test.ts
git commit -m "feat(import): catalog:remove CLI and placeholder branding"
```

---

### Task 13: Runbooks and project docs (FR-14)

**Files:**
- Create: `docs/import.md`, `docs/revocation.md`
- Modify: `CLAUDE.md` (Commands: `pnpm catalog:import`, `pnpm catalog:remove`), `docs/data-model.md` ("Removal" section: link to `docs/revocation.md`; import rule 8: one sentence that the legacy data has no alt texts, so the product name is the initial alt text and every image is listed for review), `docs/deploy.md` (section 10 Backups: one line linking to `docs/revocation.md` for deleting backups on revocation)

No tests (SC-14 is review). Content requirements:

`docs/import.md` — sections, English, no hosts/keys/CDN names:
1. **Overview** — what the importer does, D3 in two sentences, where the report goes.
2. **Snapshot export** — install MongoDB Database Tools; keep the connection string in a shell variable, never in a file inside the repo; exact commands:
   ```bash
   SNAPSHOT=~/baumann-snapshot-$(date +%F)   # outside the repo
   mkdir -p "$SNAPSHOT"
   for c in products articles colors product_colors_connection; do
     mongoexport --uri "$LEGACY_MONGO_URI" --collection "$c" --jsonArray --out "$SNAPSHOT/$c.json"
   done
   ```
3. **Environment** — the three variables; optional `.env.import` in the repo root (ignored by `.env*` in `.gitignore`, loaded by the pnpm scripts); production secret key only via `read -rs IMPORT_SUPABASE_SECRET_KEY && export IMPORT_SUPABASE_SECRET_KEY`.
4. **Local run** — `pnpm db:start`; keys from `pnpm exec supabase status`; `pnpm catalog:import --snapshot "$SNAPSHOT" --dry-run`, read the report, then without `--dry-run`; `pnpm db:reset` removes the real data from the local DB again.
5. **Production run** — only after the migration `20261009090000_import_functions.sql` is deployed (CI on `main`); dry run first, then the real run; check `/api/health` and one product with the publishable key.
6. **Re-import semantics** — D4 list (owned vs. kept fields); after the admin exists, re-import overwrites admin edits of imported fields; admin uploads must not use the `products/` prefix (orphan cleanup).
7. **Exit codes and failures** — table of the FR-8 abort cases and what to do.
8. **Afterwards** — delete the snapshot directory and the report when no longer needed (customer data).

`docs/revocation.md` — English, numbered procedure with a ≤ 14-day timeline:
1. Day 0: request received — note the date.
2. Production removal: env for production (secret key via `read -rs`), `pnpm catalog:remove --confirm <api host>`; record the printed counts.
3. Verify: product count 0 via the publishable key (`curl` with `apikey` header against `/rest/v1/product?select=id`), bucket empty, `/api/health` → `db: ok`.
4. Branding: switch the export in `config/branding.ts` to `placeholderBranding`, PR → merge → CI deploy; check the demo notice and footer.
5. Local copies: delete snapshot directories, reports, local DB data (`pnpm db:reset`).
6. Backups: database and storage backups age out after 7 days (runbook section 10); delete them earlier if requested.
7. Confirm to the customer in writing, with the date of each step.
Plus a short "What is not affected" list: the customer's own website, the Git history (never contained customer data).

- [ ] **Step 1: Write the documents and the small edits**

- [ ] **Step 2: Verify formatting and internals**

Run: `pnpm exec prettier --check docs CLAUDE.md && grep -nE "cloudinary|res\.cloudinary|baumann-entwicklungen|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" docs/import.md docs/revocation.md; echo "grep exit $?"`
Expected: prettier passes; grep finds nothing (`grep exit 1`).

- [ ] **Step 3: Commit**

```bash
git add docs/import.md docs/revocation.md docs/data-model.md docs/deploy.md CLAUDE.md
git commit -m "docs: import and revocation runbooks"
```

---

### Task 14: Rehearsal with real data (orchestrator, nothing committed)

Purpose: prove the pipeline on the real catalog before the developer exports the live snapshot, and tune nothing silently.

- [ ] **Step 1:** In the session scratchpad (never in the repo), convert the legacy CSV export (`product.csv`, `article.csv`, `color.csv`, `product_color_connection.csv`, semicolon-separated, UTF-8 with BOM) into the four snapshot JSON files in the Mongo shape (image paths as one-element arrays, `color_suffix` as integer, `vpe*` as strings, empty rows dropped). Throwaway script, scratchpad only.
- [ ] **Step 2:** `IMPORT_IMAGE_BASE_URL` = the old app's CDN base URL without transformation parameters (from the old app's config, entered in the shell only). Run `pnpm catalog:import --snapshot <scratch dir> --dry-run` against the local stack. Record: exit code, summary counts (expect 126 products, 281 articles, 2 accessory links), typed fragment ratio, finding counts per section.
- [ ] **Step 3:** Run the real local import. Record exit code, printed counts, number of uploaded objects; spot-check two products (one with a slash article number, one without suffix 0) via the service client.
- [ ] **Step 4:** If the rehearsal reveals a defect in code (not in data), fix it with a test in the owning module and commit; if it reveals a data issue, list it for the Gate 2 report. Do not add rules without evidence and a unit test.
- [ ] **Step 5:** `pnpm db:reset` to remove the real data from the local DB; delete the scratch snapshot.

---

### Task 15: Final verification

- [ ] `pnpm typecheck; echo $?` → 0
- [ ] `pnpm lint; echo $?` → 0
- [ ] `pnpm test; echo $?` → 0
- [ ] `pnpm db:test; echo $?` → 0
- [ ] `pnpm build; echo $?` → 0 (with `NEXT_PUBLIC_*` from `.env.local` or placeholders as in CI)
- [ ] `pnpm db:types && git diff --exit-code lib/supabase/database.types.ts` → no drift
- [ ] `git status` clean; `git log --oneline main..` lists the task commits
- [ ] Coverage per SC-ID mapped in the Gate 2 report (SC-1 … SC-14 on the branch; SC-15 after merge by the developer)

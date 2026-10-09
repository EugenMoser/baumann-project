import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { err, ok, type Result } from "./result.mts";

// Shapes follow the old admin app's Prisma schema as exported by
// `mongoexport --jsonArray` (relaxed extended JSON). Mongo bookkeeping fields
// (`_id`, `createdAt`, `updatedAt`, `__v`) are ignored; any other field that is
// not in the schema is reported as an unknown field (never dropped silently).
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

const knownKeys: Record<keyof typeof schemas, ReadonlySet<string>> = {
  products: new Set(Object.keys(productSchema.shape)),
  articles: new Set(Object.keys(articleSchema.shape)),
  colors: new Set(Object.keys(colorSchema.shape)),
  product_colors_connection: new Set(Object.keys(productColorSchema.shape)),
};
const IGNORED_KEYS: ReadonlySet<string> = new Set([
  "_id",
  "createdAt",
  "updatedAt",
  "__v",
]);

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
export type UnknownField = {
  file: SnapshotFile;
  field: string;
  count: number;
};
export type Snapshot = {
  products: SnapshotProduct[];
  articles: SnapshotArticle[];
  colors: SnapshotColor[];
  product_colors_connection: SnapshotProductColor[];
  /** Fields present in the raw records but not in the schema (reported, not mapped). */
  unknownFields: UnknownField[];
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
  if (result.data.length === 0)
    return invalid(`${file}.json contains no entries`);
  return ok(result.data);
}

function findUnknownFields(file: SnapshotFile, raw: unknown): UnknownField[] {
  if (!Array.isArray(raw)) return [];
  const known = knownKeys[file];
  const counts = new Map<string, number>();
  // raw already passed the array schema, so entries are objects
  for (const record of raw as unknown[]) {
    if (typeof record !== "object" || record === null) continue;
    for (const field of Object.keys(record))
      if (!known.has(field) && !IGNORED_KEYS.has(field))
        counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, count]) => ({ file, field, count }));
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
    unknownFields: SNAPSHOT_FILES.flatMap((file) =>
      findUnknownFields(file, raw[file])
    ),
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

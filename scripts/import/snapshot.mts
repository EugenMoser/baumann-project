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
  if (result.data.length === 0)
    return invalid(`${file}.json contains no entries`);
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

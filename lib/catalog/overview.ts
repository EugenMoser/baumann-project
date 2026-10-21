import { err, ok, type Result } from "@/lib/result";
import {
  createServerSupabase,
  type CatalogClient,
} from "@/lib/supabase/server";
import {
  compareProducts,
  PRODUCT_TILE,
  toProductSummaries,
} from "./categories";
import { guard, toDbError } from "./errors";
import { firstSentence } from "./text";
import type {
  CatalogError,
  CatalogOverview,
  ImageRef,
  NumberExample,
  RegisterItem,
} from "./types";

const MAX_THUMBNAILS = 3;

type OverviewRow = {
  slug: string;
  name: string;
  intro_text: string;
  product: (Parameters<typeof toProductSummaries>[0][number] & {
    article: { article_number: string; sort_order: number }[];
  })[];
};

function findExample(rows: readonly OverviewRow[]): NumberExample | null {
  for (const category of rows) {
    for (const product of [...category.product].sort(compareProducts)) {
      const [first] = [...product.article].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      if (first) {
        return {
          articleNumber: first.article_number,
          productName: product.name,
        };
      }
    }
  }
  return null;
}

// Pure: rows arrive in category order (the query sorts them).
export function toCatalogOverview(
  rows: readonly OverviewRow[]
): CatalogOverview {
  const categories: RegisterItem[] = rows.map((c) => ({
    slug: c.slug,
    name: c.name,
    productCount: c.product.length,
    subline: firstSentence(c.intro_text),
    thumbnails: toProductSummaries(c.product)
      .map((p) => p.thumbnail)
      .filter((t): t is ImageRef => t !== null)
      .slice(0, MAX_THUMBNAILS),
  }));
  return {
    categories,
    productCount: categories.reduce((sum, c) => sum + c.productCount, 0),
    articleCount: rows.reduce(
      (sum, c) => sum + c.product.reduce((n, p) => n + p.article.length, 0),
      0
    ),
    example: findExample(rows),
  };
}

export function getCatalogOverview(
  client: CatalogClient = createServerSupabase()
): Promise<Result<CatalogOverview, CatalogError>> {
  return guard(async () => {
    const { data, error } = await client
      .from("category")
      .select(
        `slug, name, intro_text, sort_order, product(${PRODUCT_TILE}, article!article_product_id_fkey(article_number, sort_order))`
      )
      .order("sort_order")
      .order("name");
    if (error) return err(toDbError(error));
    // RLS limits `product` and `article` to published rows for anon.
    return ok(toCatalogOverview(data));
  });
}

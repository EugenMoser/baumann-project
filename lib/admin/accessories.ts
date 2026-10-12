import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, STALE_SELECTION, type AdminError } from "./errors";

export type AccessoryItem = {
  articleNumber: string;
  articleName: string | null;
  productName: string;
};

export async function listAccessories(
  client: AdminClient,
  productId: number
): Promise<Result<AccessoryItem[], AdminError>> {
  const { data, error } = await client
    .from("product_accessory")
    .select(
      "sort_order, article(article_number, name, product!article_product_id_fkey(name))"
    )
    .eq("product_id", productId)
    .order("sort_order");
  if (error) return err(fromPg(error));
  return ok(
    data.map((r) => ({
      articleNumber: r.article.article_number,
      articleName: r.article.name,
      productName: r.article.product.name,
    }))
  );
}

export async function resolveArticleNumbers(
  client: AdminClient,
  numbers: string[]
): Promise<Result<Map<string, number>, AdminError>> {
  if (numbers.length === 0) return ok(new Map());
  const { data, error } = await client
    .from("article")
    .select("id, article_number")
    .in("article_number", numbers);
  if (error) return err(fromPg(error));
  return ok(new Map(data.map((a) => [a.article_number, a.id])));
}

export async function setAccessories(
  client: AdminClient,
  productId: number,
  articleIds: number[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_accessories", {
    p_product_id: productId,
    payload: articleIds.map((id) => ({ article_id: id })),
  });
  // 23503: an article was deleted between resolving and saving.
  if (error) return err(fromPg(error, {}, STALE_SELECTION));
  return ok(null);
}

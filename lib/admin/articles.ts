import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import type { ArticleInput } from "./article-schema";
import { fromPg, type AdminError } from "./errors";
import { lastArticleProblem } from "./product-rules";

const ARTICLE_CONFLICTS = { article_article_number_key: "articleNumber" };

export async function saveArticle(
  client: AdminClient,
  input: ArticleInput
): Promise<Result<{ id: number }, AdminError>> {
  const { data, error } = await client.rpc("admin_save_article", {
    payload: {
      id: input.id,
      product_id: input.productId,
      article_number: input.articleNumber,
      name: input.name,
      description: input.description,
      note: input.note,
      material_id: input.materialId,
      material_note: input.materialNote,
      sort_order: input.sortOrder,
      attributes: input.attributes.map((a) => ({
        attribute_id: a.attributeId,
        value_decimal: a.valueDecimal,
        value_text: a.valueText,
      })),
      packaging: input.packaging.map((p) => ({
        quantity: p.quantity,
        label: p.label,
      })),
    },
  });
  if (error) return err(fromPg(error, ARTICLE_CONFLICTS));
  return ok({ id: data });
}

export async function deleteArticle(
  client: AdminClient,
  productId: number,
  articleId: number
): Promise<Result<null, AdminError>> {
  const [product, count] = await Promise.all([
    client.from("product").select("status").eq("id", productId).maybeSingle(),
    client
      .from("article")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);
  if (product.error) return err(fromPg(product.error));
  if (count.error) return err(fromPg(count.error));
  if (product.data === null) return err({ kind: "not_found" });
  const problem = lastArticleProblem(product.data.status, count.count ?? 0);
  if (problem) return err({ kind: "invalid", message: problem });
  const { data, error } = await client
    .from("article")
    .delete()
    .eq("id", articleId)
    .eq("product_id", productId)
    .select("id");
  if (error) return err(fromPg(error));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function loadAttributeTypes(
  client: AdminClient
): Promise<Result<Map<number, "decimal" | "text">, AdminError>> {
  const { data, error } = await client
    .from("attribute")
    .select("id, data_type");
  if (error) return err(fromPg(error));
  return ok(new Map(data.map((a) => [a.id, a.data_type])));
}

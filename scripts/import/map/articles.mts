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
    if (a.number.trim() === "")
      return invalid(`article in product ${a.product_id} has no number`);
    if (a.number !== a.number.trim())
      return invalid(`article "${a.number}" has surrounding whitespace`);
    if (!productById.has(a.product_id))
      return invalid(
        `article ${a.number} references unknown product ${a.product_id}`
      );
    const group = groups.get(a.number) ?? [];
    if (group.some((g) => g.product_id === a.product_id))
      return invalid(
        `article ${a.number} appears twice in product ${a.product_id}`
      );
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
    const [home, ...others] = [...group].sort(
      (a, b) => a.product_id - b.product_id
    );
    if (home === undefined) continue;
    for (const o of others)
      out.product_accessories.push({
        legacy_product_id: o.product_id,
        article_number: number,
        sort_order: o.prio,
      });
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
    for (const raw of [
      home.description1,
      home.description2,
      home.description3,
      home.description4,
    ]) {
      const text = cleanText(raw);
      if (text === null) continue;
      out.fragments.total += 1;
      const parsed = parseFragment(text);
      if (
        parsed.kind === "typed" &&
        parsed.values.every((v) => !usedKeys.has(v.key))
      ) {
        out.fragments.typed += 1;
        for (const v of parsed.values) {
          usedKeys.add(v.key);
          out.article_attributes.push({
            article_number: number,
            key: v.key,
            value_decimal: v.value,
            value_text: null,
          });
        }
        if (parsed.note !== null) notes.push(parsed.note);
        if (parsed.partial && parsed.note !== null)
          out.findings.push({
            kind: "partial_attribute",
            articleNumber: number,
            text,
            remainder: parsed.note,
          });
      } else if (parsed.kind === "sentence") {
        paragraphs.push(parsed.text);
      } else {
        notes.push(text);
        out.findings.push({
          kind: "unparsed_attribute",
          articleNumber: number,
          text,
        });
      }
    }

    const quantities = new Set<number>();
    [home.vpe1, home.vpe2, home.vpe3, home.vpe4].forEach((raw, index) => {
      const text = cleanText(raw);
      if (text === null) return;
      const quantity = /^\d+$/.test(text) ? Number(text) : 0;
      if (quantity > 0) {
        if (quantities.has(quantity)) {
          out.findings.push({
            kind: "packaging_note",
            articleNumber: number,
            text: `duplicate quantity ${quantity}`,
          });
          return;
        }
        quantities.add(quantity);
        out.article_packaging.push({
          article_number: number,
          quantity,
          sort_order: index,
        });
      } else {
        notes.push(text);
        out.findings.push({
          kind: "packaging_note",
          articleNumber: number,
          text,
        });
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
  if (empty !== undefined)
    return invalid(`product ${empty.legacy_product_id} has no articles`);
  return ok(out);
}

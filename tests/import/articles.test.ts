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
const products = [
  productRow(9001, "Testkeil mit Dämpfung"),
  productRow(9003, "Testschlüssel"),
];

describe("mapArticles (FR-4, SC-4)", () => {
  it("maps an article with typed attributes and packaging", () => {
    const result = mapArticles(
      [
        article({
          product_id: 9001,
          number: "98010",
          vpe1: "500",
          vpe2: "100",
          vpe3: "500",
        }),
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
    expect(
      result.value.article_packaging.filter((p) => p.article_number === "98010")
    ).toEqual([
      { article_number: "98010", quantity: 500, sort_order: 0 },
      { article_number: "98010", quantity: 100, sort_order: 1 },
    ]);
    expect(result.value.fragments).toEqual({ total: 2, typed: 2 });
  });

  it("keeps article numbers with a slash unchanged and stores differing names", () => {
    const result = mapArticles(
      [
        article({ number: "98011/80", name: "Testkeil hoch" }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok && result.value.articles[0]).toMatchObject({
      article_number: "98011/80",
      name: "Testkeil hoch",
    });
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
    expect(result.value.findings).toEqual(
      expect.arrayContaining([
        {
          kind: "partial_attribute",
          articleNumber: "98010",
          text: "Höhe 9,5 mm abgesetzt",
          remainder: "abgesetzt",
        },
        { kind: "unparsed_attribute", articleNumber: "98010", text: "Ø 12 mm" },
      ])
    );
  });

  it("treats a second value for the same key as unparsed", () => {
    const result = mapArticles(
      [
        article({ description1: "Höhe 8 mm", description2: "Höhe 9 mm" }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.article_attributes.filter(
        (a) => a.article_number === "98010"
      )
    ).toHaveLength(1);
    expect(result.value.articles[0].note).toBe("Höhe 9 mm");
  });

  it("moves non-integer packaging to the note", () => {
    const result = mapArticles(
      [
        article({ vpe1: "wird passend verpackt …", vpe2: "  " }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.articles[0].note).toBe("wird passend verpackt …");
    expect(result.value.findings).toContainEqual({
      kind: "packaging_note",
      articleNumber: "98010",
      text: "wird passend verpackt …",
    });
    expect(
      result.value.article_packaging.filter((p) => p.article_number === "98010")
    ).toEqual([]);
  });

  it("reports a repeated packaging quantity without adding it to the note", () => {
    const result = mapArticles(
      [
        article({ vpe1: "500", vpe3: "500" }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings).toContainEqual({
      kind: "packaging_note",
      articleNumber: "98010",
      text: "duplicate quantity 500",
    });
    expect(result.value.articles[0].note).toBeNull();
    expect(
      result.value.article_packaging.filter((p) => p.article_number === "98010")
    ).toHaveLength(1);
  });

  it("rejects an article number with surrounding whitespace", () => {
    const result = mapArticles(
      [
        article({ number: "98010 " }),
        article({ product_id: 9003, number: "98030", name: "Testschlüssel" }),
      ],
      products
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_data",
        message: 'article "98010 " has surrounding whitespace',
      },
    });
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
    expect(
      result.value.articles.filter((a) => a.article_number === "98010")
    ).toEqual([expect.objectContaining({ legacy_product_id: 9001 })]);
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
      error: {
        kind: "invalid_data",
        message: "article 98010 references unknown product 9009",
      },
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
    expect(
      mapArticles(
        [article(), article(), article({ product_id: 9003, number: "98030" })],
        products
      ).ok
    ).toBe(false);
    expect(
      mapArticles(
        [
          article({ number: " " }),
          article({ product_id: 9003, number: "98030" }),
        ],
        products
      ).ok
    ).toBe(false);
  });
});

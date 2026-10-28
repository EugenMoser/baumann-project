import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import type { ArticleAttributeView, ArticleView } from "./types";
import {
  articleOptions,
  buildVariantMatrix,
  orderBoxNumbers,
  orderNumberFor,
} from "./variants";

describe("buildVariantMatrix (FR-5, SC-5)", () => {
  it("maps every article to its order number per colour", () => {
    const matrix = buildVariantMatrix(makeProductPage());
    expect(matrix.options.map((o) => [o.key, o.name, o.suffix])).toEqual([
      ["color-3", "braun", "1"],
      ["color-1", "weiß", "2"],
    ]);
    expect(matrix.defaultKey).toBe("color-3");
    expect(matrix.byArticle["99211/80"]).toEqual({
      numbers: { "color-3": "99211/80 - 1", "color-1": "99211/80 - 2" },
      fallback: "99211/80 - 1",
    });
  });

  it("uses the bare article number without colours", () => {
    const page = makeProductPage({
      colors: [],
      variants: [
        {
          orderNumber: "99010",
          articleNumber: "99010",
          suffix: null,
          isDefault: true,
          colorId: null,
        },
      ],
      articles: [makeProductPage().articles[0]],
    });
    const matrix = buildVariantMatrix(page);
    expect(matrix.options).toEqual([]);
    expect(matrix.defaultKey).toBeNull();
    expect(matrix.byArticle["99010"]).toEqual({
      numbers: {},
      fallback: "99010",
    });
  });

  it("falls back to the first colour when no default is set", () => {
    const page = makeProductPage();
    const colors = page.colors.map((c) => ({ ...c, isDefault: false }));
    expect(buildVariantMatrix({ ...page, colors }).defaultKey).toBe("color-3");
  });
});

describe("orderBoxNumbers (D4)", () => {
  it("returns null without articles", () => {
    const page = makeProductPage();
    expect(orderBoxNumbers(buildVariantMatrix(page), [])).toBeNull();
  });

  it("takes each colour number from the first article that has one", () => {
    const page = makeProductPage();
    const matrix = buildVariantMatrix(page);
    const [first, second] = page.articles;
    matrix.byArticle[first.articleNumber] = {
      numbers: { "color-3": "99010 - 1" },
      fallback: "99010 - 1",
    };
    const box = orderBoxNumbers(matrix, [first, second]);
    expect(box?.numbers).toEqual({
      "color-3": "99010 - 1",
      "color-1": "99211/80 - 2",
    });
    expect(box?.fallback).toBe("99010 - 1");
  });

  it("returns empty numbers and the first article number without colours", () => {
    const page = makeProductPage({ colors: [], variants: [] });
    const box = orderBoxNumbers(buildVariantMatrix(page), page.articles);
    expect(box).toEqual({ numbers: {}, fallback: "99010" });
  });
});

function art(
  n: string,
  name: string | null,
  attributes: ArticleAttributeView[]
): ArticleView {
  return {
    articleNumber: n,
    name,
    description: null,
    note: null,
    material: null,
    materialNote: null,
    attributes,
    packaging: [],
  };
}

const attr = (
  key: string,
  value: number | string,
  sortOrder: number,
  unit: string | null = "mm"
): ArticleAttributeView => ({ key, label: key, unit, value, sortOrder });

describe("articleOptions (4b SC-4)", () => {
  it("labels articles with their differing attribute values", () => {
    const articles = [
      art("99010", "Testkeil 8 mm", [attr("height", 8, 0)]),
      art("99011", "Testkeil 10 mm", [attr("height", 10, 0)]),
    ];
    expect(articleOptions(articles).map((o) => o.label)).toEqual([
      "99010 · 8 mm",
      "99011 · 10 mm",
    ]);
    expect(articleOptions(articles)[0].articleNumber).toBe("99010");
  });

  it("falls back to the name, then the bare number, when nothing differs", () => {
    const same = [attr("height", 8, 0)];
    expect(
      articleOptions([
        art("1", "Kappe A", same),
        art("2", "Kappe B", same),
      ]).map((o) => o.label)
    ).toEqual(["1 · Kappe A", "2 · Kappe B"]);
    expect(
      articleOptions([art("1", null, same), art("2", null, same)]).map(
        (o) => o.label
      )
    ).toEqual(["1", "2"]);
  });

  it("shows only the first two differing values, in column order", () => {
    const articles = [
      art("1", null, [attr("a", 1, 0), attr("b", 2, 1), attr("c", 3, 2)]),
      art("2", null, [attr("a", 4, 0), attr("b", 5, 1), attr("c", 6, 2)]),
    ];
    expect(articleOptions(articles).map((o) => o.label)).toEqual([
      "1 · 1 mm · 2 mm",
      "2 · 4 mm · 5 mm",
    ]);
  });

  it("uses the name for an article that lacks the only differing key", () => {
    const articles = [art("1", "A", [attr("height", 8, 0)]), art("2", "B", [])];
    expect(articleOptions(articles).map((o) => o.label)).toEqual([
      "1 · 8 mm",
      "2 · B",
    ]);
  });
});

describe("orderNumberFor (4b SC-4)", () => {
  const matrix = buildVariantMatrix(makeProductPage());
  const { byArticle } = matrix;

  it("returns the number for a known article and colour", () => {
    expect(orderNumberFor(byArticle, "99010", "color-1")).toBe("99010 - 2");
  });

  it("falls back without or with an unknown colour", () => {
    expect(orderNumberFor(byArticle, "99010", null)).toBe("99010 - 1");
    expect(orderNumberFor(byArticle, "99010", "color-99")).toBe("99010 - 1");
  });

  it("returns null without or with an unknown article", () => {
    expect(orderNumberFor(byArticle, null, "color-1")).toBeNull();
    expect(orderNumberFor(byArticle, "00000", "color-1")).toBeNull();
  });

  it("maps a colour without suffix to the bare article number", () => {
    const page = makeProductPage();
    const variants = [
      {
        orderNumber: "99010",
        articleNumber: "99010",
        suffix: null,
        isDefault: false,
        colorId: 1,
      },
      {
        orderNumber: "99010 - 1",
        articleNumber: "99010",
        suffix: "1",
        isDefault: true,
        colorId: 3,
      },
    ];
    const m = buildVariantMatrix({ ...page, variants });
    expect(orderNumberFor(m.byArticle, "99010", "color-1")).toBe("99010");
  });
});

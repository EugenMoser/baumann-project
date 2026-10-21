import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { buildVariantMatrix, orderBoxNumbers } from "./variants";

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

import { describe, expect, it } from "vitest";
import { toCatalogOverview } from "./overview";

type MediaRow = {
  role: "thumbnail" | "gallery";
  sort_order: number;
  media: {
    storage_path: string;
    width: number;
    height: number;
    alt_text: string;
  };
};

type OverviewRow = {
  slug: string;
  name: string;
  intro_text: string;
  sort_order: number;
  product: {
    slug: string;
    name: string;
    subtitle: string | null;
    sort_order: number;
    product_media: MediaRow[];
    article: { article_number: string; sort_order: number }[];
  }[];
};

function thumb(path: string): MediaRow[] {
  return [
    {
      role: "thumbnail",
      sort_order: 0,
      media: { storage_path: path, width: 800, height: 600, alt_text: path },
    },
  ];
}

function product(
  slug: string,
  sort_order: number,
  articles: [string, number][],
  media: MediaRow[] = []
): OverviewRow["product"][number] {
  return {
    slug,
    name: slug,
    subtitle: null,
    sort_order,
    product_media: media,
    article: articles.map(([article_number, order]) => ({
      article_number,
      sort_order: order,
    })),
  };
}

function category(
  slug: string,
  sort_order: number,
  products: OverviewRow["product"],
  intro_text = "Intro. Mehr."
): OverviewRow {
  return { slug, name: slug, intro_text, sort_order, product: products };
}

describe("toCatalogOverview", () => {
  it("counts products and articles and picks the first article of the first product as example", () => {
    const rows = [
      category("a", 0, [
        product("second", 1, [["A-9", 0]]),
        product("first", 0, [
          ["F-2", 2],
          ["F-0", 0],
          ["F-1", 1],
        ]),
      ]),
      category("b", 1, [product("other", 0, [["B-1", 0]])]),
    ];
    const result = toCatalogOverview(rows);
    expect(result.categories.map((c) => c.productCount)).toEqual([2, 1]);
    expect(result.productCount).toBe(3);
    expect(result.articleCount).toBe(5);
    expect(result.example).toEqual({
      articleNumber: "F-0",
      productName: "first",
    });
  });

  it("derives the subline from the first sentence of the intro", () => {
    const [item] = toCatalogOverview([
      category("a", 0, [], "Erster Satz. Zweiter Satz."),
    ]).categories;
    expect(item.subline).toBe("Erster Satz.");
  });

  it("keeps a category without products with zero count and no thumbnails", () => {
    const result = toCatalogOverview([category("leer", 0, [], "Nur Intro.")]);
    expect(result.categories).toEqual([
      {
        slug: "leer",
        name: "leer",
        productCount: 0,
        subline: "Nur Intro.",
        thumbnails: [],
      },
    ]);
    expect(result.productCount).toBe(0);
    expect(result.articleCount).toBe(0);
  });

  it("skips products without thumbnails and returns at most three", () => {
    const rows = [
      category("a", 0, [
        product("p0", 0, [], thumb("p0.webp")),
        product("p1", 1, [], []),
        product("p2", 2, [], thumb("p2.webp")),
        product("p3", 3, [], thumb("p3.webp")),
        product("p4", 4, [], thumb("p4.webp")),
      ]),
    ];
    const [item] = toCatalogOverview(rows).categories;
    expect(item.thumbnails.map((t) => t.storagePath)).toEqual([
      "p0.webp",
      "p2.webp",
      "p3.webp",
    ]);
    expect(item.productCount).toBe(5);
  });

  it("returns example null when no product has an article", () => {
    const result = toCatalogOverview([category("a", 0, [product("p", 0, [])])]);
    expect(result.example).toBeNull();
    expect(result.articleCount).toBe(0);
  });

  it("returns an empty overview for no categories", () => {
    expect(toCatalogOverview([])).toEqual({
      categories: [],
      productCount: 0,
      articleCount: 0,
      example: null,
    });
  });
});

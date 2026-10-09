// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  completePayload,
  mapSnapshot,
} from "../../scripts/import/map/index.mts";
import { article, color, link, product, snapshot } from "./factory";

const options = { imageBaseUrl: "https://cdn.example.test/base" };

describe("mapSnapshot", () => {
  it("combines all mappings into one payload", () => {
    const result = mapSnapshot(
      snapshot({
        products: [
          product(),
          product({
            product_id: 9002,
            category: "wasser",
            name: "Testsiphon",
            material: "TPE",
            imageUrls_small: [],
            imageUrls_big: [],
          }),
        ],
        articles: [
          article(),
          article({
            product_id: 9002,
            number: "98020",
            description1: "für Schlauch Ø 10 mm",
          }),
        ],
        colors: [color()],
        product_colors_connection: [link()],
      }),
      options
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { payload, stats, media } = result.value;
    expect(payload.categories.map((c) => c.slug)).toEqual([
      "moebel",
      "halterung",
      "wasser",
      "lueftung",
      "elektro",
    ]);
    expect(payload.materials.map((m) => m.code)).toEqual(["PA-6", "TPE"]);
    expect(payload.attributes.map((a) => a.key)).toEqual([
      "height",
      "hose_diameter",
    ]);
    expect(payload.category_attributes).toEqual([
      { category_slug: "moebel", attribute_key: "height", sort_order: 10 },
      {
        category_slug: "wasser",
        attribute_key: "hose_diameter",
        sort_order: 70,
      },
    ]);
    expect(media).toHaveLength(2);
    expect(stats).toEqual({
      products: 2,
      articles: 2,
      accessories: 0,
      colors: 1,
      materials: 2,
      attributes: 2,
      images: 2,
      fragments: 2,
      typedFragments: 2,
    });
  });

  it("passes mapping errors through", () => {
    const result = mapSnapshot(
      snapshot({ articles: [article({ product_id: 9009 })] }),
      options
    );
    expect(result.ok).toBe(false);
  });
});

describe("completePayload", () => {
  it("adds dimensions to every media row", () => {
    const mapped = mapSnapshot(snapshot(), options);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const dims = new Map(
      mapped.value.media.map((m) => [m.storage_path, { width: 40, height: 30 }])
    );
    const result = completePayload(mapped.value, dims);
    expect(result.ok && result.value.media).toEqual(
      mapped.value.media.map((m) => ({
        storage_path: m.storage_path,
        width: 40,
        height: 30,
        alt_text: m.alt_text,
      }))
    );
  });

  it("fails when a dimension is missing", () => {
    const mapped = mapSnapshot(snapshot(), options);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(completePayload(mapped.value, new Map()).ok).toBe(false);
  });
});

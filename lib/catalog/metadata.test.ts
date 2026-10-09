import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { categoryMetadata, productMetadata } from "./metadata";

describe("productMetadata (FR-12, SC-12)", () => {
  it("builds title and description from data", () => {
    expect(productMetadata(makeProductPage())).toEqual({
      title: "Testkeil",
      description:
        "Testkeil – für Beispielschlösser. Artikel 99010, 99211/80 in 2 Farben.",
    });
  });

  it("uses SEO overrides", () => {
    expect(
      productMetadata(makeProductPage({ seoTitle: "T", seoDescription: "D" }))
    ).toEqual({ title: "T", description: "D" });
  });

  it("shortens long article lists", () => {
    const page = makeProductPage({
      subtitle: null,
      colors: [],
      articles: ["1", "2", "3", "4"].map((n) => ({
        ...makeProductPage().articles[0],
        articleNumber: `9900${n}`,
      })),
    });
    expect(productMetadata(page).description).toBe(
      "Testkeil. Artikel 99001, 99002, 99003 u. a."
    );
  });
});

describe("categoryMetadata (FR-12, SC-12)", () => {
  const base = {
    slug: "moebel",
    name: "Möbel",
    introText: "",
    seoTitle: null,
    seoDescription: null,
    products: [],
  };

  it("falls back to a generic sentence without intro text", () => {
    expect(categoryMetadata(base)).toEqual({
      title: "Möbel",
      description: "Möbel: alle Produkte im Überblick.",
    });
  });

  it("uses the shortened intro text", () => {
    expect(
      categoryMetadata({ ...base, introText: "Kurzer Text." }).description
    ).toBe("Kurzer Text.");
  });
});

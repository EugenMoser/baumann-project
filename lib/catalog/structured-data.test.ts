import { describe, expect, it } from "vitest";
import { makeProductPage } from "./fixtures";
import { buildProductGroup, serializeJsonLd } from "./structured-data";

const url = "https://preview.example.com/produkte/moebel/testkeil";
const img = (p: string) => `https://cdn.example.com/${p}`;

describe("buildProductGroup (FR-7, SC-7)", () => {
  it("builds a ProductGroup with one variant per order number", () => {
    const data = buildProductGroup(
      makeProductPage({
        media: [
          {
            storagePath: "a.webp",
            width: 1,
            height: 1,
            altText: "x",
            altOrigin: "human",
            role: "thumbnail",
          },
        ],
      }),
      url,
      img
    );
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      productGroupID: "testkeil",
      name: "Testkeil",
      description: "Erster Absatz.\n\nZweiter Absatz.",
      url,
      image: ["https://cdn.example.com/a.webp"],
      variesBy: ["https://schema.org/color", "https://schema.org/size"],
      hasVariant: [
        {
          "@type": "Product",
          sku: "99010 - 1",
          name: "Testkeil 99010 - 1",
          color: "braun",
        },
        {
          "@type": "Product",
          sku: "99010 - 2",
          name: "Testkeil 99010 - 2",
          color: "weiß",
        },
        {
          "@type": "Product",
          sku: "99211/80 - 1",
          name: "Testkeil 99211/80 - 1",
          color: "braun",
        },
        {
          "@type": "Product",
          sku: "99211/80 - 2",
          name: "Testkeil 99211/80 - 2",
          color: "weiß",
        },
      ],
    });
  });

  it("omits empty fields and never invents offers", () => {
    const data = buildProductGroup(
      makeProductPage({
        description: null,
        subtitle: null,
        colors: [],
        articles: [makeProductPage().articles[0]],
        variants: [
          {
            orderNumber: "99010",
            articleNumber: "99010",
            suffix: null,
            isDefault: true,
            colorId: null,
          },
        ],
      }),
      url,
      img
    );
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("variesBy");
    expect(data).not.toHaveProperty("offers");
    expect(data.hasVariant).toEqual([
      { "@type": "Product", sku: "99010", name: "Testkeil 99010" },
    ]);
  });
});

describe("serializeJsonLd (Review Focus 4)", () => {
  it("escapes < so text cannot close the script tag", () => {
    const out = serializeJsonLd({
      description: "</script><script>alert(1)</script>",
    });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({
      description: "</script><script>alert(1)</script>",
    });
  });
});

describe("buildProductGroup images (4b SC-1)", () => {
  it("lists exactly the gallery image URLs in order", () => {
    const m = (path: string) => ({
      storagePath: path,
      width: 465,
      height: 200,
      altText: path,
      altOrigin: "human" as const,
      role: "gallery" as const,
    });
    const data = buildProductGroup(
      makeProductPage({ media: [m("g1.webp"), m("g2.webp")] }),
      url,
      img
    );
    expect(data.image).toEqual([
      "https://cdn.example.com/g1.webp",
      "https://cdn.example.com/g2.webp",
    ]);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapProducts } from "../../scripts/import/map/products.mts";
import { product } from "./factory";

describe("mapProducts (FR-3, SC-3)", () => {
  it("maps a product", () => {
    const result = mapProducts([
      product({
        description2: " Erster Absatz. ",
        description3: "",
        description4: "Zweiter Absatz.",
        material: "PA-6 (temperaturbeständig bis 100° C)",
      }),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        products: [
          {
            legacy_product_id: 9001,
            category_slug: "moebel",
            slug: "testkeil-mit-daempfung",
            name: "Testkeil mit Dämpfung",
            subtitle: "für Testschlösser",
            description: "Erster Absatz.\n\nZweiter Absatz.",
            material_code: "PA-6",
            material_note: "temperaturbeständig bis 100° C",
            sort_order: 10000,
          },
        ],
        findings: [],
      },
    });
  });

  it("maps empty texts to null", () => {
    const result = mapProducts([
      product({ description1: "", description2: " ", material: "" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products[0]).toMatchObject({
      subtitle: null,
      description: null,
      material_code: null,
      material_note: null,
    });
  });

  it("reports a material fallback", () => {
    const result = mapProducts([
      product({ material: "Wandteil: PA-6 / Blende: ABS" }),
    ]);
    expect(result.ok && result.value.findings).toEqual([
      {
        kind: "material_fallback",
        legacyProductId: 9001,
        text: "Wandteil: PA-6 / Blende: ABS",
      },
    ]);
  });

  it("resolves a name collision with the subtitle", () => {
    const result = mapProducts([
      product({
        product_id: 9001,
        name: "Testträger",
        description1: "für 16 mm",
      }),
      product({
        product_id: 9002,
        name: "Testträger",
        description1: "für 19 mm",
      }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products.map((p) => p.slug)).toEqual([
      "testtraeger-fuer-16-mm",
      "testtraeger-fuer-19-mm",
    ]);
    expect(result.value.findings).toEqual([
      {
        kind: "slug_collision",
        legacyProductId: 9001,
        slug: "testtraeger-fuer-16-mm",
        level: "subtitle",
      },
      {
        kind: "slug_collision",
        legacyProductId: 9002,
        slug: "testtraeger-fuer-19-mm",
        level: "subtitle",
      },
    ]);
  });

  it("falls back to the legacy id when subtitles collide or are missing", () => {
    const result = mapProducts([
      product({ product_id: 9001, name: "Testgitter", description1: "weiß" }),
      product({ product_id: 9002, name: "Testgitter", description1: "weiß" }),
      product({ product_id: 9003, name: "Testgitter", description1: null }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products.map((p) => p.slug)).toEqual([
      "testgitter-9001",
      "testgitter-9002",
      "testgitter-9003",
    ]);
    expect(
      result.value.findings.every(
        (f) => f.kind === "slug_collision" && f.level === "legacy_id"
      )
    ).toBe(true);
  });

  it("allows the same slug in different categories", () => {
    const result = mapProducts([
      product({ product_id: 9001, name: "Testabdeckung", category: "moebel" }),
      product({ product_id: 9002, name: "Testabdeckung", category: "elektro" }),
    ]);
    expect(result.ok && result.value.findings).toEqual([]);
  });

  it("rejects an unknown category", () => {
    const result = mapProducts([product({ category: "garten" })]);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_data",
        message: 'product 9001 has unknown category "garten"',
      },
    });
  });

  it("rejects a duplicate product id", () => {
    const result = mapProducts([product(), product()]);
    expect(result.ok).toBe(false);
  });

  it("rejects a product whose name yields no slug", () => {
    const result = mapProducts([product({ name: "Ø" })]);
    expect(result.ok).toBe(false);
  });
});

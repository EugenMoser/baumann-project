import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getCategoryPage, listCategories } from "@/lib/catalog/categories";
import { getProductPage } from "@/lib/catalog/product";
import type { Database } from "@/lib/supabase/database.types";

// Nothing listens on port 9; requests fail at the network level.
const unreachable = createClient<Database>(
  "http://127.0.0.1:9",
  "sb_publishable_unreachable",
  { auth: { persistSession: false } }
);

describe("listCategories (FR-10, SC-10)", () => {
  it("returns all categories in sort order", async () => {
    const result = await listCategories();
    expect(result).toEqual({
      ok: true,
      value: [
        { slug: "moebelteile", name: "Möbelteile (Beispiel)" },
        { slug: "sanitaer", name: "Sanitärteile (Beispiel)" },
      ],
    });
  });

  it("returns a db_error instead of throwing when the database is unreachable", async () => {
    const result = await listCategories(unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

describe("getCategoryPage (FR-10, SC-10)", () => {
  it("returns the category with its published products in sort order", async () => {
    const result = await getCategoryPage("moebelteile");
    expect(result).toEqual({
      ok: true,
      value: {
        slug: "moebelteile",
        name: "Möbelteile (Beispiel)",
        introText: "Beispieltext für die Kategorie Möbelteile.",
        seoTitle: null,
        seoDescription: null,
        products: [
          {
            slug: "testkeil-mit-daempfung",
            name: "Testkeil mit Dämpfung",
            subtitle: "für Beispielschlösser",
          },
          { slug: "testabdeckung", name: "Testabdeckung", subtitle: null },
        ],
      },
    });
  });

  it("returns not_found for an unknown slug", async () => {
    expect(await getCategoryPage("gibt-es-nicht")).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await getCategoryPage("moebelteile", unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

describe("getProductPage (FR-10, SC-10)", () => {
  it("returns the full product page", async () => {
    const result = await getProductPage(
      "moebelteile",
      "testkeil-mit-daempfung"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.value;

    expect(page).toMatchObject({
      slug: "testkeil-mit-daempfung",
      name: "Testkeil mit Dämpfung",
      subtitle: "für Beispielschlösser",
      descriptionOrigin: "human",
      category: { slug: "moebelteile", name: "Möbelteile (Beispiel)" },
      material: { code: "PA-6", name: "Polyamid 6" },
    });
    expect(page.articles.map((a) => a.articleNumber)).toEqual([
      "99010",
      "99011",
    ]);
    expect(page.articles[0]).toMatchObject({
      name: "Testkeil 8 mm",
      attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 8 }],
      packaging: [
        { quantity: 100, label: null },
        { quantity: 500, label: null },
      ],
    });
    expect(page.colors.map((c) => [c.name, c.suffix, c.isDefault])).toEqual([
      ["braun", "1", true],
      ["weiß", "2", false],
    ]);
    expect(page.variants.map((v) => v.orderNumber)).toEqual([
      "99010 - 1",
      "99010 - 2",
      "99011 - 1",
      "99011 - 2",
    ]);
    expect(page.media).toEqual([
      {
        storagePath: "products/testkeil-1.webp",
        width: 800,
        height: 600,
        altText: "Testkeil mit Dämpfung, Seitenansicht",
        altOrigin: "human",
        role: "thumbnail",
      },
    ]);
    // The only accessory's home product is a draft (Review Focus 3).
    expect(page.accessories).toEqual([]);
  });

  it("returns accessories and colourless variants", async () => {
    const result = await getProductPage("moebelteile", "testabdeckung");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.colors).toEqual([]);
    expect(result.value.variants.map((v) => v.orderNumber)).toEqual(["99300"]);
    expect(result.value.accessories).toEqual([
      {
        articleNumber: "99011",
        name: "Testkeil 10 mm",
        productSlug: "testkeil-mit-daempfung",
        productName: "Testkeil mit Dämpfung",
        categorySlug: "moebelteile",
      },
    ]);
  });

  it.each([
    ["an unpublished product", "moebelteile", "entwurfsteil"],
    ["an archived product", "sanitaer", "altteil"],
    ["a product in another category", "sanitaer", "testkeil-mit-daempfung"],
    ["an unknown product", "moebelteile", "gibt-es-nicht"],
    ["an unknown category", "gibt-es-nicht", "testkeil-mit-daempfung"],
  ])("returns not_found for %s", async (_label, categorySlug, productSlug) => {
    expect(await getProductPage(categorySlug, productSlug)).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await getProductPage(
      "moebelteile",
      "testkeil-mit-daempfung",
      unreachable
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

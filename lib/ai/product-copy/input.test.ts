import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import {
  buildCopyInput,
  inputNumbers,
  loadCopySource,
  type CopySource,
} from "./input.ts";

const source: CopySource = {
  productId: 7,
  status: "published",
  category: "Dachhauben",
  name: "Dachhaube Classic",
  subtitle: "Robust",
  description: "Eine Haube.",
  material: { code: "ABS", name: "Acrylnitril-Butadien-Styrol" },
  materialNote: "UV-stabil",
  articles: [
    {
      number: "A-100",
      name: "Haube klein",
      description: null,
      note: null,
      material: null,
      materialNote: null,
      attributes: [
        { label: "Durchmesser", value: 15.5, unit: "mm" },
        { label: "Form", value: "rund", unit: null },
      ],
      packaging: [{ quantity: 20, label: "Karton" }],
    },
    {
      number: "A-200",
      name: null,
      description: null,
      note: null,
      material: { code: "PP", name: "Polypropylen" },
      materialNote: null,
      attributes: [],
      packaging: [],
    },
  ],
  colors: [
    { name: "Weiß", isDefault: true },
    { name: "Grau", isDefault: false },
  ],
};

describe("buildCopyInput", () => {
  it("contains exactly the D2 fields and counts", () => {
    const input = buildCopyInput(source);
    expect(Object.keys(input).sort()).toEqual(
      [
        "anzahlArtikel",
        "anzahlFarben",
        "artikel",
        "bisherigeBeschreibung",
        "farben",
        "kategorie",
        "material",
        "materialhinweis",
        "produkt",
        "untertitel",
      ].sort()
    );
    expect(input.anzahlArtikel).toBe(2);
    expect(input.anzahlFarben).toBe(2);
    expect(input.material).toBe("ABS – Acrylnitril-Butadien-Styrol");
    expect(input.bisherigeBeschreibung).toBe("Eine Haube.");
    expect(input.farben).toEqual([
      { name: "Weiß", standard: true },
      { name: "Grau", standard: false },
    ]);
  });

  it("falls back to the product material and formats attribute values", () => {
    const [first, second] = buildCopyInput(source).artikel;
    expect(first.material).toBe("ABS – Acrylnitril-Butadien-Styrol");
    expect(second.material).toBe("PP – Polypropylen");
    expect(first.merkmale).toEqual([
      { name: "Durchmesser", wert: "15,5", einheit: "mm" },
      { name: "Form", wert: "rund", einheit: null },
    ]);
    expect(first.verpackung).toEqual([{ menge: 20, bezeichnung: "Karton" }]);
  });

  it("sends no ids, status or storage paths", () => {
    const json = JSON.stringify(buildCopyInput(source));
    expect(json).not.toContain("productId");
    expect(json).not.toContain("published");
    expect(json).not.toContain("storage");
  });

  it("maps an empty description to null", () => {
    expect(
      buildCopyInput({ ...source, description: "  " }).bisherigeBeschreibung
    ).toBeNull();
    expect(
      buildCopyInput({ ...source, description: null }).bisherigeBeschreibung
    ).toBeNull();
  });

  it("handles a product without articles and colours", () => {
    const input = buildCopyInput({ ...source, articles: [], colors: [] });
    expect(input.anzahlArtikel).toBe(0);
    expect(input.anzahlFarben).toBe(0);
    expect(input.artikel).toEqual([]);
    expect(input.farben).toEqual([]);
  });
});

describe("inputNumbers", () => {
  it("contains decimal-comma values and the counts", () => {
    const numbers = inputNumbers(buildCopyInput(source));
    expect(numbers.has("15,5")).toBe(true);
    expect(numbers.has("2")).toBe(true);
    expect(numbers.has("20")).toBe(true);
    expect(numbers.has("100")).toBe(true);
  });

  it("contains numbers written inside text fields", () => {
    const numbers = inputNumbers(
      buildCopyInput({
        ...source,
        subtitle: "Für 32 mm Rohre",
        articles: [{ ...source.articles[0], note: "Ab 2,5 mm Wandstärke" }],
      })
    );
    expect(numbers.has("32")).toBe(true);
    expect(numbers.has("2,5")).toBe(true);
  });
});

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; id?: number } = {};
  const chain = {
    eq: (_: string, id: number) => {
      calls.id = id;
      return chain;
    },
    maybeSingle: async () => result,
  };
  const client = {
    from: (table: string) => {
      calls.table = table;
      return { select: () => chain };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const row = {
  id: 7,
  status: "draft",
  name: "Dachhaube",
  subtitle: null,
  description: "",
  material_note: null,
  category: { name: "Dachhauben" },
  material: { code: "ABS", name: "ABS-Kunststoff" },
  article: [
    {
      article_number: "B",
      name: null,
      description: null,
      note: null,
      material_note: null,
      sort_order: 2,
      material: null,
      article_attribute: [
        {
          value_decimal: 3,
          value_text: null,
          attribute: { label: "Höhe", unit: "cm", sort_order: 1 },
        },
        {
          value_decimal: null,
          value_text: "grau",
          attribute: { label: "Ton", unit: null, sort_order: 0 },
        },
      ],
      article_packaging: [{ quantity: 10, label: null, sort_order: 0 }],
    },
    {
      article_number: "A",
      name: "Erster",
      description: null,
      note: null,
      material_note: null,
      sort_order: 1,
      material: null,
      article_attribute: [],
      article_packaging: [],
    },
  ],
  product_color: [
    { is_default: false, sort_order: 2, color: { name: "Grau" } },
    { is_default: true, sort_order: 1, color: { name: "Weiß" } },
  ],
};

describe("loadCopySource", () => {
  it("maps a product row and orders articles and colours", async () => {
    const { client, calls } = fakeClient({ data: row, error: null });
    const result = await loadCopySource(client, 7);
    expect(calls).toEqual({ table: "product", id: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const v = result.value;
    expect(v.productId).toBe(7);
    expect(v.category).toBe("Dachhauben");
    expect(v.articles.map((a) => a.number)).toEqual(["A", "B"]);
    expect(v.articles[1].attributes).toEqual([
      { label: "Ton", value: "grau", unit: null },
      { label: "Höhe", value: 3, unit: "cm" },
    ]);
    expect(v.colors).toEqual([
      { name: "Weiß", isDefault: true },
      { name: "Grau", isDefault: false },
    ]);
  });

  it("reports a missing row as not_found", async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await loadCopySource(client, 1)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("reports a database error as db_error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "x" } });
    expect(await loadCopySource(client, 1)).toEqual({
      ok: false,
      error: "db_error",
    });
  });
});

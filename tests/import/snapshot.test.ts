// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSnapshot, readSnapshot } from "../../scripts/import/snapshot.mts";

const valid = {
  products: [
    {
      _id: { $oid: "000000000000000000000001" },
      product_id: 9001,
      prio: 10000,
      category: "moebel",
      name: "Testkeil",
      description1: "für Testschlösser",
      description2: "",
      description3: null,
      material: "PA-6",
      imageUrls_small: ["/a_98010-Testkeil.webp"],
      imageUrls_big: [],
      createdAt: { $date: "2024-11-23T00:00:00.000Z" },
    },
  ],
  articles: [
    {
      product_id: 9001,
      number: "98010",
      prio: 10000,
      name: "Testkeil",
      description1: "Höhe 8 mm",
      vpe1: "500",
      vpe2: 100,
      vpe3: null,
    },
  ],
  colors: [{ color_id: "1-1", name: "testweiß", code: "#F2F5F3" }],
  product_colors_connection: [
    { product_id: 9001, color_id: "1-1", color_suffix: 0 },
  ],
};

describe("parseSnapshot (FR-2, SC-2)", () => {
  it("parses a valid snapshot and normalises optional fields", () => {
    const result = parseSnapshot(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.products[0].imageUrls_big).toEqual([]);
    expect(result.value.articles[0].vpe1).toBe("500");
    expect(result.value.articles[0].vpe2).toBe("100");
    expect(result.value.articles[0].vpe3).toBeNull();
    expect(result.value.articles[0].vpe4).toBeNull();
  });

  it("treats missing image arrays as empty", () => {
    const {
      imageUrls_small: _s,
      imageUrls_big: _b,
      ...bare
    } = valid.products[0];
    const result = parseSnapshot({ ...valid, products: [bare] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.products[0].imageUrls_small).toEqual([]);
  });

  it("rejects an empty collection with the file name", () => {
    const result = parseSnapshot({ ...valid, articles: [] });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "snapshot_invalid",
        message: "articles.json contains no entries",
      },
    });
  });

  it("rejects a wrong type with file name and path", () => {
    const result = parseSnapshot({
      ...valid,
      products: [{ ...valid.products[0], product_id: "9001" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("products.json");
      expect(result.error.message).toContain("0.product_id");
    }
  });

  it("rejects an unknown shape", () => {
    const result = parseSnapshot({ ...valid, colors: [{ foo: "bar" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("colors.json");
  });

  it("rejects a collection that is not an array", () => {
    const result = parseSnapshot({ ...valid, colors: { color_id: "1-1" } });
    expect(result.ok).toBe(false);
  });
});

describe("readSnapshot (FR-2, SC-2)", () => {
  async function writeSnapshot(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "snapshot-"));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content);
    }
    return dir;
  }

  it("reads the four files", async () => {
    const dir = await writeSnapshot(
      Object.fromEntries(
        Object.entries(valid).map(([name, rows]) => [
          `${name}.json`,
          JSON.stringify(rows),
        ])
      )
    );
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(true);
  });

  it("names a missing file", async () => {
    const dir = await writeSnapshot({
      "products.json": JSON.stringify(valid.products),
      "articles.json": JSON.stringify(valid.articles),
      "colors.json": JSON.stringify(valid.colors),
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain(
        "product_colors_connection.json is missing"
      );
  });

  it("names a file with invalid JSON", async () => {
    const dir = await writeSnapshot({
      "products.json": "{not json",
      "articles.json": "[]",
      "colors.json": "[]",
      "product_colors_connection.json": "[]",
    });
    const result = await readSnapshot(dir);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain("products.json is not valid JSON");
  });
});

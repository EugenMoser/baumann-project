import { describe, expect, it } from "vitest";
import { attributeColumns, summarizeAttributes } from "./attribute-summary";
import type { ArticleAttributeView, ArticleView } from "./types";

function article(
  n: string,
  attributes: ArticleAttributeView[] = []
): ArticleView {
  return {
    articleNumber: n,
    name: null,
    description: null,
    note: null,
    material: null,
    materialNote: null,
    attributes,
    packaging: [],
  };
}

const height = (value: number | string): ArticleAttributeView => ({
  key: "height",
  label: "Höhe",
  unit: "mm",
  value,
});

const heights = (values: (number | string)[]) =>
  values.map((v, i) => article(`99${i}`, [height(v)]));

describe("summarizeAttributes (D4)", () => {
  it("joins up to six numeric values ascending with the unit once", () => {
    expect(summarizeAttributes(heights([11, 8, 9.5]))).toEqual([
      { key: "height", label: "Höhe", text: "8 / 9,5 / 11 mm" },
    ]);
  });

  it("shows a range for more than six distinct numeric values", () => {
    const values = [8, 9, 10, 11, 12, 13, 14, 15.5];
    expect(summarizeAttributes(heights(values))[0].text).toBe("8 – 15,5 mm");
  });

  it("omits a key with more than six distinct text values", () => {
    const values = ["a", "b", "c", "d", "e", "f", "g"];
    expect(summarizeAttributes(heights(values))).toEqual([]);
  });

  it("keeps first-seen order for text values", () => {
    const attr = (v: string): ArticleAttributeView => ({
      key: "shape",
      label: "Form",
      unit: null,
      value: v,
    });
    const result = summarizeAttributes([
      article("1", [attr("rund")]),
      article("2", [attr("eckig")]),
    ]);
    expect(result[0].text).toBe("rund / eckig");
  });

  it("uses the text rule for mixed numeric and text values", () => {
    const attr = (value: number | string): ArticleAttributeView => ({
      key: "surface",
      label: "Oberfläche",
      unit: null,
      value,
    });
    const result = summarizeAttributes([
      article("1", [attr(8)]),
      article("2", [attr("glatt")]),
    ]);
    expect(result).toEqual([
      { key: "surface", label: "Oberfläche", text: "8 / glatt" },
    ]);
  });

  it("collapses duplicate values", () => {
    expect(summarizeAttributes(heights([8, 8, 9.5, 8]))[0].text).toBe(
      "8 / 9,5 mm"
    );
  });

  it("returns an empty list for no articles", () => {
    expect(summarizeAttributes([])).toEqual([]);
  });

  it("returns an empty list when articles have no attributes", () => {
    expect(summarizeAttributes([article("1"), article("2")])).toEqual([]);
  });

  it("limits the result to four entries by default", () => {
    const attrs = ["a", "b", "c", "d", "e"].map((key) => ({
      key,
      label: key.toUpperCase(),
      unit: null,
      value: 1,
    }));
    const result = summarizeAttributes([article("1", attrs)]);
    expect(result.map((r) => r.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("respects a custom max", () => {
    const attrs = ["a", "b", "c"].map((key) => ({
      key,
      label: key,
      unit: null,
      value: 1,
    }));
    expect(summarizeAttributes([article("1", attrs)], 2)).toHaveLength(2);
  });
});

describe("attributeColumns (D4)", () => {
  it("unions keys over articles in first-seen order", () => {
    const a = (key: string): ArticleAttributeView => ({
      key,
      label: key,
      unit: null,
      value: 1,
    });
    const cols = attributeColumns([
      article("1", [a("height"), a("width")]),
      article("2", [a("depth"), a("height")]),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["height", "width", "depth"]);
  });

  it("marks a purely numeric key as numeric and carries label and unit", () => {
    expect(attributeColumns(heights([8, 9]))).toEqual([
      { key: "height", label: "Höhe", unit: "mm", numeric: true },
    ]);
  });

  it("marks a key with a text value as not numeric", () => {
    expect(attributeColumns(heights([8, "glatt"]))[0].numeric).toBe(false);
  });

  it("returns an empty list without attributes", () => {
    expect(attributeColumns([article("1")])).toEqual([]);
    expect(attributeColumns([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  DUPLICATE_COLOR,
  DUPLICATE_SUFFIX,
  NEEDS_ONE_DEFAULT,
  parseColors,
  readColorsForm,
  type ColorValues,
} from "./color-schema";

const row = (colorId: string, suffix = "") => ({ colorId, suffix });

describe("parseColors (SC-10)", () => {
  it("accepts a valid set and marks the default", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "1"), row("1", " 2 ")],
      defaultColorId: "3",
    });
    expect(r.ok && r.value.rows).toEqual([
      { colorId: 3, suffix: "1", isDefault: true, sortOrder: 0 },
      { colorId: 1, suffix: "2", isDefault: false, sortOrder: 1 },
    ]);
  });
  it("accepts an empty set", () => {
    expect(
      parseColors({ productId: "1", rows: [], defaultColorId: "" }).ok
    ).toBe(true);
  });
  it.each<[ColorValues, string]>([
    [
      { productId: "1", rows: [row("3"), row("3")], defaultColorId: "3" },
      DUPLICATE_COLOR,
    ],
    [
      {
        productId: "1",
        rows: [row("3", "1"), row("1", "1")],
        defaultColorId: "3",
      },
      DUPLICATE_SUFFIX,
    ],
    [
      { productId: "1", rows: [row("3"), row("1")], defaultColorId: "" },
      NEEDS_ONE_DEFAULT,
    ],
    [
      { productId: "1", rows: [row("3")], defaultColorId: "1" },
      NEEDS_ONE_DEFAULT,
    ],
  ])("reports %#", (values, message) => {
    const r = parseColors(values);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.colors).toBe(message);
  });
  it("limits the suffix to 10 characters", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "x".repeat(11))],
      defaultColorId: "3",
    });
    expect(!r.ok && r.fieldErrors["rows.0.suffix"]).toBe(
      "Höchstens 10 Zeichen."
    );
  });
});

describe("colour order from row position (6c SC-4)", () => {
  it("ignores stray sortOrder form entries", () => {
    const fd = new FormData();
    fd.append("productId", "1");
    fd.append("colorId", "3");
    fd.append("colorId", "1");
    fd.append("suffix", "1");
    fd.append("suffix", "2");
    fd.append("sortOrder", "9");
    fd.append("sortOrder", "0");
    fd.append("defaultColor", "3");
    expect(readColorsForm(fd).rows).toEqual([
      { colorId: "3", suffix: "1" },
      { colorId: "1", suffix: "2" },
    ]);
  });
  it("sets sortOrder to the row index", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "1"), row("1", "2"), row("2", "3")],
      defaultColorId: "3",
    });
    expect(r.ok && r.value.rows.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
    expect(r.ok && r.value.rows.map((x) => x.colorId)).toEqual([3, 1, 2]);
  });
});

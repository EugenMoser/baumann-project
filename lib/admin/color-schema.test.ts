import { describe, expect, it } from "vitest";
import {
  DUPLICATE_COLOR,
  DUPLICATE_SUFFIX,
  NEEDS_ONE_DEFAULT,
  parseColors,
  type ColorValues,
} from "./color-schema";

const row = (colorId: string, suffix = "", sortOrder = "0") => ({
  colorId,
  suffix,
  sortOrder,
});

describe("parseColors (SC-10)", () => {
  it("accepts a valid set and marks the default", () => {
    const r = parseColors({
      productId: "1",
      rows: [row("3", "1"), row("1", " 2 ", "1")],
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

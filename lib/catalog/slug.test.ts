import { describe, expect, it } from "vitest";
import { firstFreeSlug, SLUG_PATTERN, slugBase, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Schließkeile mit Dämpfung", "schliesskeile-mit-daempfung"],
    ["  Rohrschelle Ø 15 mm ", "rohrschelle-15-mm"],
    ["Café/Größe (neu)", "cafe-groesse-neu"],
    ["---", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("produces slugs that match the database check", () => {
    expect(SLUG_PATTERN.test(slugify("Testkeil 8 mm"))).toBe(true);
    expect(SLUG_PATTERN.test("Bad Slug")).toBe(false);
  });
});

describe("slugBase (6c SC-1)", () => {
  it.each([
    ["Testkeil mit Dämpfung", "testkeil-mit-daempfung"],
    ["Stütze Ø 20 mm / lang", "stuetze-20-mm-lang"],
    ["!!!", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugBase(input)).toBe(expected);
  });

  it("cuts a long name at the last hyphen within 120 characters", () => {
    const base = slugBase(Array(30).fill("abcdef").join(" "));
    expect(base.length).toBeLessThanOrEqual(120);
    expect(base.endsWith("abcdef")).toBe(true);
    expect(base.endsWith("-")).toBe(false);
    expect(SLUG_PATTERN.test(base)).toBe(true);
  });

  it("hard-cuts a single long word at 120 characters", () => {
    expect(slugBase("a".repeat(130))).toHaveLength(120);
  });

  it("keeps all words when the cut falls right behind a hyphen", () => {
    const name = `${"a".repeat(59)}-${"b".repeat(60)}-ccc`;
    expect(slugBase(name)).toBe(`${"a".repeat(59)}-${"b".repeat(60)}`);
  });
});

describe("firstFreeSlug (6c SC-1)", () => {
  it.each([
    ["rohr", [], "rohr"],
    ["rohr", ["rohr"], "rohr-2"],
    ["rohr", ["rohr", "rohr-2"], "rohr-3"],
    ["rohr", ["rohr", "rohr-2", "rohr-4"], "rohr-3"],
    ["rohr", ["rohrschelle", "rohr-2a"], "rohr"],
    ["rohr-2", ["rohr-2"], "rohr-2-2"],
  ])("%s with %j → %s", (base, taken, expected) => {
    expect(firstFreeSlug(base, taken)).toBe(expected);
  });
});

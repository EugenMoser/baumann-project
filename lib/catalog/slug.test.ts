import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "./slug";

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

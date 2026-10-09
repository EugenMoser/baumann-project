import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../scripts/import/categories.mts";

describe("CATEGORIES (FR-9, SC-9)", () => {
  it("lists the five legacy categories with text fields", () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      "moebel",
      "halterung",
      "wasser",
      "lueftung",
      "elektro",
    ]);
    for (const c of CATEGORIES) {
      expect(typeof c.intro_text).toBe("string");
      expect(c.seo_title === null || c.seo_title.length > 0).toBe(true);
      expect(c.seo_description === null || c.seo_description.length > 0).toBe(
        true
      );
    }
  });
});

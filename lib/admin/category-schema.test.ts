// lib/admin/category-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  CATEGORY_FIELDS,
  categorySchema,
  emptyCategoryValues,
  readCategoryForm,
} from "./category-schema";

const valid = {
  ...emptyCategoryValues(),
  name: "Neue Kategorie",
};

describe("categorySchema (SC-10)", () => {
  it("accepts valid input and parses attributes", () => {
    const parsed = categorySchema.parse({
      ...valid,
      attributes: [{ attributeId: "2", sortOrder: "1" }],
    });
    expect(parsed).toMatchObject({
      name: "Neue Kategorie",
      introText: "",
      seoTitle: null,
      sortOrder: 0,
      attributes: [{ attributeId: 2, sortOrder: 1 }],
    });
  });
  it("rejects empty name and long SEO title with German messages", () => {
    const result = categorySchema.safeParse({
      ...valid,
      name: " ",
      seoTitle: "x".repeat(71),
    });
    expect(result.success).toBe(false);
    const messages = result.success
      ? []
      : result.error.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Bitte einen Namen eingeben.",
        "Höchstens 70 Zeichen.",
      ])
    );
  });
  it("rejects a name without letters or digits (6c SC-1)", () => {
    const result = categorySchema.safeParse({ ...valid, name: "!!!" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe(
        "Der Name braucht mindestens einen Buchstaben oder eine Ziffer."
      );
  });
});

describe("readCategoryForm", () => {
  it("ignores a slug entry (6c SC-1)", () => {
    const fd = new FormData();
    fd.set("name", "X");
    fd.set("slug", "eigener-slug");
    expect(readCategoryForm(fd)).not.toHaveProperty("slug");
    expect(CATEGORY_FIELDS).not.toContain("slug");
  });
  it("reads checked attributes with their sort order", () => {
    const fd = new FormData();
    fd.set("name", "X");
    fd.append("attributeId", "1");
    fd.append("attributeId", "3");
    fd.set("attrSort-1", "0");
    fd.set("attrSort-3", "2");
    fd.set("attrSort-2", "5"); // unchecked: ignored
    expect(readCategoryForm(fd).attributes).toEqual([
      { attributeId: "1", sortOrder: "0" },
      { attributeId: "3", sortOrder: "2" },
    ]);
  });
});

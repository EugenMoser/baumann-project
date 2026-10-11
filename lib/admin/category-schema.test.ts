// lib/admin/category-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  categorySchema,
  emptyCategoryValues,
  readCategoryForm,
  withDefaultCategorySlug,
} from "./category-schema";

const valid = {
  ...emptyCategoryValues(),
  name: "Neue Kategorie",
  slug: "neue-kategorie",
};

describe("categorySchema (SC-10)", () => {
  it("accepts valid input and parses attributes", () => {
    const parsed = categorySchema.parse({
      ...valid,
      attributes: [{ attributeId: "2", sortOrder: "1" }],
    });
    expect(parsed).toMatchObject({
      name: "Neue Kategorie",
      slug: "neue-kategorie",
      introText: "",
      seoTitle: null,
      sortOrder: 0,
      attributes: [{ attributeId: 2, sortOrder: 1 }],
    });
  });
  it("rejects empty name, invalid slug and long SEO title with German messages", () => {
    const result = categorySchema.safeParse({
      ...valid,
      name: " ",
      slug: "Groß",
      seoTitle: "x".repeat(71),
    });
    expect(result.success).toBe(false);
    const messages = result.success
      ? []
      : result.error.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Bitte einen Namen eingeben.",
        "Nur Kleinbuchstaben, Ziffern und Bindestriche.",
        "Höchstens 70 Zeichen.",
      ])
    );
  });
  it("fills the slug from the name", () => {
    expect(
      withDefaultCategorySlug({ ...valid, slug: "", name: "Möbel & Türen" })
        .slug
    ).toBe("moebel-tueren");
  });
});

describe("readCategoryForm", () => {
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

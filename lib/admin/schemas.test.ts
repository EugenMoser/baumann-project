import { describe, expect, it } from "vitest";
import {
  emptyProductValues,
  PRODUCT_FIELDS,
  productSchema,
  type ProductValues,
} from "./schemas";
import { readFields, zodFieldErrors } from "./form";

const valid: ProductValues = {
  ...emptyProductValues(),
  categoryId: "1",
  name: "Testkeil",
  status: "draft",
  sortOrder: "0",
};

describe("product schema (SC-6)", () => {
  it("accepts valid input and normalises empty optionals to null", () => {
    const parsed = productSchema.parse(valid);
    expect(parsed).toMatchObject({
      categoryId: 1,
      name: "Testkeil",
      subtitle: null,
      materialId: null,
      sortOrder: 0,
    });
  });
  it.each([
    [{ name: "  " }, "name", "Bitte einen Namen eingeben."],
    [{ categoryId: "" }, "categoryId", "Bitte eine Kategorie wählen."],
    [
      { categoryId: "12345678901" },
      "categoryId",
      "Bitte eine Kategorie wählen.",
    ],
    [{ materialId: "12345678901" }, "materialId", "Ungültige Auswahl."],
    [
      { name: "!!!" },
      "name",
      "Der Name braucht mindestens einen Buchstaben oder eine Ziffer.",
    ],
    [{ seoTitle: "x".repeat(71) }, "seoTitle", "Höchstens 70 Zeichen."],
    [
      { seoDescription: "x".repeat(161) },
      "seoDescription",
      "Höchstens 160 Zeichen.",
    ],
    [{ status: "deleted" }, "status", "Ungültiger Status."],
    [{ sortOrder: "1.5" }, "sortOrder", "Bitte eine ganze Zahl eingeben."],
  ])("rejects %o", (patch, field, message) => {
    const result = productSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(zodFieldErrors(result.error)[field]).toBe(message);
  });
  it("has no slug field and ignores a slug from the form data (6c SC-1)", () => {
    expect(PRODUCT_FIELDS).not.toContain("slug");
    const fd = new FormData();
    fd.set("name", "Testkeil");
    fd.set("slug", "eigener-slug");
    expect(readFields(fd, PRODUCT_FIELDS)).not.toHaveProperty("slug");
    const parsed = productSchema.parse({ ...valid, slug: "eigener-slug" });
    expect(parsed).not.toHaveProperty("slug");
  });
});

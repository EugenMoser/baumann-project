import { describe, expect, it } from "vitest";
import {
  emptyProductValues,
  productSchema,
  withDefaultSlug,
  type ProductValues,
} from "./schemas";
import { zodFieldErrors } from "./form";

const valid: ProductValues = {
  ...emptyProductValues(),
  categoryId: "1",
  name: "Testkeil",
  slug: "testkeil",
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
    [
      { slug: "Bad Slug" },
      "slug",
      "Nur Kleinbuchstaben, Ziffern und Bindestriche.",
    ],
    [{ categoryId: "" }, "categoryId", "Bitte eine Kategorie wählen."],
    [
      { categoryId: "12345678901" },
      "categoryId",
      "Bitte eine Kategorie wählen.",
    ],
    [{ materialId: "12345678901" }, "materialId", "Ungültige Auswahl."],
    [{ slug: "a".repeat(121) }, "slug", "Höchstens 120 Zeichen."],
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
  it("fills an empty slug from the name", () => {
    expect(
      withDefaultSlug({ ...valid, slug: " ", name: "Schließkeil 8 mm" }).slug
    ).toBe("schliesskeil-8-mm");
    expect(withDefaultSlug({ ...valid, slug: "eigener-slug" }).slug).toBe(
      "eigener-slug"
    );
  });
});

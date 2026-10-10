import { describe, expect, it } from "vitest";
import { findVariant } from "@/lib/catalog/variant-lookup";

describe("findVariant (FR-8, SC-8)", () => {
  it("finds a seeded order number with product data", async () => {
    expect(await findVariant("99010-1")).toEqual({
      ok: true,
      value: {
        orderNumber: "99010 - 1",
        productName: "Testkeil mit Dämpfung",
        categorySlug: "moebelteile",
        productSlug: "testkeil-mit-daempfung",
      },
    });
  });

  it.each(["00000", "99400"])(
    "returns not_found for %s (unknown, draft)",
    async (q) => {
      expect(await findVariant(q)).toEqual({
        ok: false,
        error: { kind: "not_found" },
      });
    }
  );
});

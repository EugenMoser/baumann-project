import { describe, expect, it } from "vitest";
import { branding, brandingSchema } from "./branding";

const valid = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  developer: { name: "Dev Person", url: "https://dev.example" },
};

describe("brandingSchema (FR-5, SC-5)", () => {
  it("accepts the shipped branding", () => {
    expect(brandingSchema.safeParse(branding).success).toBe(true);
  });

  it("accepts a complete valid object", () => {
    expect(brandingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty company name", () => {
    expect(
      brandingSchema.safeParse({ ...valid, companyName: "" }).success
    ).toBe(false);
  });

  it("rejects an invalid official site URL", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        officialSiteUrl: "baumann-entwicklungen",
      }).success
    ).toBe(false);
  });

  it("rejects a non-http official site URL", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        officialSiteUrl: "ftp://example.com",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid developer URL", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        developer: { name: "Dev", url: "not a url" },
      }).success
    ).toBe(false);
  });
});

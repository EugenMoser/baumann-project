import { describe, expect, it } from "vitest";
import { brandingSchema, branding, placeholderBranding } from "./branding";

const valid = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  qualityPolicy: ["Ein Absatz."],
  developer: {
    name: "Dev Person",
    url: "https://dev.example",
    imprintUrl: "https://dev.example/impressum",
    privacyUrl: "https://dev.example/datenschutz",
  },
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
        developer: { ...valid.developer, url: "not a url" },
      }).success
    ).toBe(false);
  });
});

describe("brandingSchema legal links and policy", () => {
  it.each(["imprintUrl", "privacyUrl"] as const)(
    "rejects a missing or non-http %s (FR-1, SC-1)",
    (key) => {
      const rest = Object.fromEntries(
        Object.entries(valid.developer).filter(([k]) => k !== key)
      );
      expect(
        brandingSchema.safeParse({ ...valid, developer: rest }).success
      ).toBe(false);
      expect(
        brandingSchema.safeParse({
          ...valid,
          developer: { ...valid.developer, [key]: "ftp://dev.example/x" },
        }).success
      ).toBe(false);
    }
  );

  it("rejects an empty quality policy (FR-7, SC-7)", () => {
    expect(
      brandingSchema.safeParse({ ...valid, qualityPolicy: [] }).success
    ).toBe(false);
    expect(
      brandingSchema.safeParse({ ...valid, qualityPolicy: [""] }).success
    ).toBe(false);
  });
});

describe("placeholderBranding (FR-13, SC-13)", () => {
  it("passes the schema", () => {
    expect(brandingSchema.safeParse(placeholderBranding).success).toBe(true);
  });

  it("contains none of the customer strings", () => {
    const serialized = JSON.stringify(placeholderBranding);
    for (const value of [
      branding.companyName,
      branding.shortName,
      branding.officialSiteUrl,
      ...branding.qualityPolicy,
    ]) {
      expect(serialized).not.toContain(value);
    }
  });
});

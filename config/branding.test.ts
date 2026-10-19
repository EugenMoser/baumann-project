import { describe, expect, it } from "vitest";
import { brandingSchema, branding, placeholderBranding } from "./branding";

const valid = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  qualityPolicy: ["Ein Absatz."],
  descriptor: "Kunststoffteile · Katalog",
  home: {
    title: "Titel.",
    lead: "Einleitung.",
    facts: [{ value: "42", label: "Beispielwert" }],
  },
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

describe("brandingSchema home copy and descriptor", () => {
  const fact = { value: "42", label: "Beispielwert" };

  it("accepts the shipped branding with descriptor and four facts", () => {
    expect(branding.descriptor.length).toBeGreaterThan(0);
    expect(branding.home.title.length).toBeGreaterThan(0);
    expect(branding.home.lead.length).toBeGreaterThan(0);
    expect(branding.home.facts).toHaveLength(4);
    expect(brandingSchema.safeParse(branding).success).toBe(true);
  });

  it("accepts the placeholder branding with descriptor and home copy", () => {
    expect(placeholderBranding.descriptor.length).toBeGreaterThan(0);
    expect(placeholderBranding.home.title.length).toBeGreaterThan(0);
    expect(placeholderBranding.home.lead.length).toBeGreaterThan(0);
    expect(brandingSchema.safeParse(placeholderBranding).success).toBe(true);
  });

  it("rejects a branding without descriptor", () => {
    const { descriptor: _omit, ...rest } = valid;
    void _omit;
    expect(brandingSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a branding without home", () => {
    const { home: _omit, ...rest } = valid;
    void _omit;
    expect(brandingSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty descriptor, home title or home lead", () => {
    expect(brandingSchema.safeParse({ ...valid, descriptor: "" }).success).toBe(
      false
    );
    expect(
      brandingSchema.safeParse({ ...valid, home: { ...valid.home, title: "" } })
        .success
    ).toBe(false);
    expect(
      brandingSchema.safeParse({ ...valid, home: { ...valid.home, lead: "" } })
        .success
    ).toBe(false);
  });

  it("rejects a fact with an empty value or label", () => {
    for (const bad of [
      { value: "", label: "x" },
      { value: "x", label: "" },
    ]) {
      expect(
        brandingSchema.safeParse({
          ...valid,
          home: { ...valid.home, facts: [bad] },
        }).success
      ).toBe(false);
    }
  });

  it("accepts an empty fact list and four facts", () => {
    for (const facts of [[], [fact, fact, fact, fact]]) {
      expect(
        brandingSchema.safeParse({ ...valid, home: { ...valid.home, facts } })
          .success
      ).toBe(true);
    }
  });

  it("rejects a fact list of five entries", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        home: { ...valid.home, facts: [fact, fact, fact, fact, fact] },
      }).success
    ).toBe(false);
  });
});

describe("placeholderBranding home copy has no customer content", () => {
  it("has no facts", () => {
    expect(placeholderBranding.home.facts).toEqual([]);
  });

  it.each(["Baumann", "1984", "ISO", "Arburg", "Allgäu"])(
    "does not contain %s",
    (needle) => {
      expect(JSON.stringify(placeholderBranding)).not.toContain(needle);
    }
  );
});

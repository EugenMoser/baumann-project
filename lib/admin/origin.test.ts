import { describe, expect, it } from "vitest";
import { nextOrigin, productOrigins } from "./origin";

describe("origin rule (SC-7)", () => {
  it.each([
    ["human", false, "human"],
    ["ai", false, "ai"],
    ["ai_edited", false, "ai_edited"],
    ["human", true, "human"],
    ["ai", true, "ai_edited"],
    ["ai_edited", true, "ai_edited"],
  ] as const)("%s, changed=%s → %s", (prev, changed, expected) => {
    expect(nextOrigin(prev, changed)).toBe(expected);
  });

  const base = {
    description: "Text",
    seoTitle: "Titel",
    seoDescription: "Beschreibung",
  };
  it("new products start as human", () => {
    expect(productOrigins(null, base)).toEqual({
      description_origin: "human",
      seo_origin: "human",
    });
  });
  it("tracks description and SEO separately", () => {
    const prev = { ...base, descriptionOrigin: "ai", seoOrigin: "ai" } as const;
    expect(productOrigins(prev, { ...base, description: "Neu" })).toEqual({
      description_origin: "ai_edited",
      seo_origin: "ai",
    });
    expect(productOrigins(prev, { ...base, seoDescription: "Neu" })).toEqual({
      description_origin: "ai",
      seo_origin: "ai_edited",
    });
    expect(productOrigins(prev, { ...base, seoTitle: null })).toEqual({
      description_origin: "ai",
      seo_origin: "ai_edited",
    });
  });
});

describe("origin with accepted suggestions (SC-6)", () => {
  const prev = {
    description: null,
    seoTitle: null,
    seoDescription: null,
    descriptionOrigin: "human",
    seoOrigin: "human",
  } as const;
  const next = {
    description: "Vorschlag",
    seoTitle: "SEO-Titel",
    seoDescription: "SEO-Beschreibung",
  };
  const accepted = {
    description: "Vorschlag",
    seoTitle: "SEO-Titel",
    seoDescription: "SEO-Beschreibung",
  };

  it("an accepted description saved unchanged is ai", () => {
    expect(productOrigins(prev, next, accepted).description_origin).toBe("ai");
  });
  it("an accepted description edited before saving is ai_edited", () => {
    const edited = { ...next, description: "Vorschlag, ergänzt" };
    expect(productOrigins(prev, edited, accepted).description_origin).toBe(
      "ai_edited"
    );
  });
  it("compares line breaks and outer whitespace normalised (R11)", () => {
    const output = "Zeile eins\nZeile zwei\n";
    // Browsers submit textarea line breaks as CRLF.
    const saved = { ...next, description: "Zeile eins\r\nZeile zwei" };
    expect(
      productOrigins(prev, saved, { description: output }).description_origin
    ).toBe("ai");
  });
  it("SEO is ai when every non-empty field equals its accepted output", () => {
    expect(productOrigins(prev, next, accepted).seo_origin).toBe("ai");
  });
  it("SEO is ai_edited when one accepted field was edited", () => {
    const edited = { ...next, seoDescription: "Anders" };
    expect(productOrigins(prev, edited, accepted).seo_origin).toBe("ai_edited");
  });
  it("only seoTitle accepted and a human seoDescription is ai_edited", () => {
    expect(
      productOrigins(prev, next, { seoTitle: "SEO-Titel" }).seo_origin
    ).toBe("ai_edited");
  });
  it("only seoTitle accepted and an empty seoDescription is ai", () => {
    expect(
      productOrigins(
        prev,
        { ...next, seoDescription: null },
        { seoTitle: "SEO-Titel" }
      ).seo_origin
    ).toBe("ai");
  });
  it("an emptied description is human, accepted or not", () => {
    const emptied = { ...next, description: null };
    const aiPrev = {
      ...prev,
      description: "Alt",
      descriptionOrigin: "ai",
    } as const;
    expect(productOrigins(aiPrev, emptied).description_origin).toBe("human");
    expect(productOrigins(aiPrev, emptied, accepted).description_origin).toBe(
      "human"
    );
  });
  it("both SEO fields emptied is human", () => {
    const aiPrev = {
      ...prev,
      seoTitle: "A",
      seoDescription: "B",
      seoOrigin: "ai",
    } as const;
    expect(
      productOrigins(aiPrev, { ...next, seoTitle: null, seoDescription: null })
        .seo_origin
    ).toBe("human");
  });
  it("without accepted text the existing rule applies", () => {
    const aiPrev = {
      ...prev,
      ...next,
      descriptionOrigin: "ai",
      seoOrigin: "ai",
    } as const;
    expect(productOrigins(aiPrev, next)).toEqual({
      description_origin: "ai",
      seo_origin: "ai",
    });
    expect(
      productOrigins(aiPrev, { ...next, description: "Neu" }).description_origin
    ).toBe("ai_edited");
  });
});

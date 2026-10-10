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

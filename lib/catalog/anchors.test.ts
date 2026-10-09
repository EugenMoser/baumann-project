import { describe, expect, it } from "vitest";
import { articleAnchorId, exactHitTarget, productPath } from "./anchors";
import type { SearchHit } from "./types";

const hit = (over: Partial<SearchHit>): SearchHit => ({
  categorySlug: "moebel",
  productSlug: "testkeil",
  name: "Testkeil",
  subtitle: null,
  matchedNumbers: [],
  matchKind: "text",
  ...over,
});

describe("anchors (FR-4, FR-8, SC-4, SC-8)", () => {
  it("maps slashes and spaces in article numbers", () => {
    expect(articleAnchorId("99010")).toBe("artikel-99010");
    expect(articleAnchorId("99211/80")).toBe("artikel-99211-80");
  });

  it("builds product paths", () => {
    expect(productPath("moebel", "testkeil")).toBe("/produkte/moebel/testkeil");
  });

  it("redirects a single exact hit to the article anchor", () => {
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99211/80 - 2"] }),
      ])
    ).toBe("/produkte/moebel/testkeil#artikel-99211-80");
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99010"] }),
      ])
    ).toBe("/produkte/moebel/testkeil#artikel-99010");
  });

  it("does not redirect for several hits or non-exact hits", () => {
    expect(
      exactHitTarget([
        hit({ matchKind: "number", matchedNumbers: ["99010 - 1"] }),
      ])
    ).toBeNull();
    expect(
      exactHitTarget([
        hit({ matchKind: "exact_number", matchedNumbers: ["99010"] }),
        hit({ productSlug: "anderes" }),
      ])
    ).toBeNull();
    expect(exactHitTarget([])).toBeNull();
  });
});

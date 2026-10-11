import { describe, expect, it } from "vitest";
import { needsAltReview } from "./alt-review";

describe("needsAltReview (SC-8)", () => {
  it("matches an alt text equal to the name, ignoring case and outer spaces", () => {
    expect(needsAltReview("Testkeil", [" testkeil "])).toBe(true);
  });
  it("does not match other texts or products without images", () => {
    expect(needsAltReview("Testkeil", ["Testkeil, Seitenansicht"])).toBe(false);
    expect(needsAltReview("Testkeil", [])).toBe(false);
  });
});

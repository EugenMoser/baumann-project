import { describe, expect, it } from "vitest";
import {
  lastArticleProblem,
  LAST_ARTICLE,
  publishProblem,
  PUBLISH_NEEDS_ARTICLE,
  PUBLISH_NEEDS_DEFAULT,
} from "./product-rules";

describe("publish rules (SC-11)", () => {
  it("needs an article", () => {
    expect(
      publishProblem({ articleCount: 0, colorCount: 0, defaultColorCount: 0 })
    ).toBe(PUBLISH_NEEDS_ARTICLE);
  });
  it("needs exactly one default colour when colours exist", () => {
    expect(
      publishProblem({ articleCount: 1, colorCount: 2, defaultColorCount: 0 })
    ).toBe(PUBLISH_NEEDS_DEFAULT);
  });
  it("passes without colours or with one default", () => {
    expect(
      publishProblem({ articleCount: 1, colorCount: 0, defaultColorCount: 0 })
    ).toBeNull();
    expect(
      publishProblem({ articleCount: 2, colorCount: 3, defaultColorCount: 1 })
    ).toBeNull();
  });
  it("refuses deleting the last article of a published product", () => {
    expect(lastArticleProblem("published", 1)).toBe(LAST_ARTICLE);
    expect(lastArticleProblem("published", 2)).toBeNull();
    expect(lastArticleProblem("draft", 1)).toBeNull();
  });
});

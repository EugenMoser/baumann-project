import { describe, expect, it } from "vitest";
import { likePattern, parseFilter } from "./filter";

describe("parseFilter (Review Focus 2)", () => {
  it("parses valid params", () => {
    expect(
      parseFilter({ kategorie: "2", status: "draft", q: " 99211/80 " })
    ).toEqual({ categoryId: 2, status: "draft", q: "99211/80" });
  });
  it("ignores invalid values and uses the first of repeated params", () => {
    expect(
      parseFilter({ kategorie: ["abc", "1"], status: "foo", q: "" })
    ).toEqual({ categoryId: null, status: null, q: null });
    expect(parseFilter({ kategorie: ["1", "2"] }).categoryId).toBe(1);
  });
  it("caps the search text at 100 characters", () => {
    expect(parseFilter({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("likePattern (Review Focus 1)", () => {
  it("escapes LIKE wildcards and backslashes", () => {
    expect(likePattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
  it("maps the PostgREST wildcard * to a single-character match", () => {
    expect(likePattern("a*b")).toBe("%a_b%");
  });
});

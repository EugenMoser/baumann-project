import { describe, expect, it } from "vitest";
import { toParagraphs, truncate } from "./text";

describe("toParagraphs (D8)", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(toParagraphs("A\nB\n\n  \nC")).toEqual([["A", "B"], ["C"]]);
  });

  it("returns nothing for null or whitespace", () => {
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs("  \n ")).toEqual([]);
  });
});

describe("truncate (D11)", () => {
  it("keeps short text and normalises whitespace", () => {
    expect(truncate("a  b\nc")).toBe("a b c");
  });

  it("cuts at a word boundary and adds an ellipsis", () => {
    const text = `${"Wort ".repeat(40)}Ende`;
    const result = truncate(text, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

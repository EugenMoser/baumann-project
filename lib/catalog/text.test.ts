import { describe, expect, it } from "vitest";
import { firstSentence, toParagraphs, truncate } from "./text";

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

describe("firstSentence", () => {
  it("returns the text up to and including the first sentence end", () => {
    expect(firstSentence("Erster Satz. Zweiter.")).toBe("Erster Satz.");
  });

  it("returns the whole text when there is no sentence end", () => {
    expect(firstSentence("Ohne Punkt")).toBe("Ohne Punkt");
  });

  it("returns null for whitespace-only text", () => {
    expect(firstSentence("  ")).toBeNull();
  });

  it("returns null for null", () => {
    expect(firstSentence(null)).toBeNull();
  });

  it("does not end the sentence at a decimal point", () => {
    expect(firstSentence("Maß 1.5 mm ist gut. Rest")).toBe(
      "Maß 1.5 mm ist gut."
    );
  });

  it("cuts a long sentence at a word boundary and adds an ellipsis", () => {
    const text = `${"Wort ".repeat(23)}Ende.`;
    expect(text.length).toBeGreaterThanOrEqual(120);
    const result = firstSentence(text);
    expect(result).not.toBeNull();
    expect(result!.endsWith("…")).toBe(true);
    expect(result!.length).toBeLessThanOrEqual(81);
    expect(result).not.toMatch(/\s…$/);
    expect(
      result!
        .slice(0, -1)
        .split(" ")
        .every((w) => w === "Wort")
    ).toBe(true);
  });

  it("does not end the sentence after the abbreviation z. B.", () => {
    expect(firstSentence("Teile für z. B. Caravans. Rest")).toBe(
      "Teile für z. B. Caravans."
    );
  });

  it("does not end the sentence after the abbreviation Ca.", () => {
    expect(firstSentence("Ca. 20 Teile. Mehr")).toBe("Ca. 20 Teile.");
  });

  it("keeps the whole text when it only contains the abbreviation bzw.", () => {
    expect(firstSentence("Halter bzw. Clips für Möbel.")).toBe(
      "Halter bzw. Clips für Möbel."
    );
  });

  it("ends the sentence before an umlaut capital", () => {
    expect(firstSentence("Fertig. Über alles")).toBe("Fertig.");
  });

  it("keeps the last full word when index max is a space", () => {
    const text = `${"a".repeat(75)} wort rest und mehr.`;
    expect(text[80]).toBe(" ");
    expect(firstSentence(text)).toBe(`${"a".repeat(75)} wort…`);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanBlock,
  cleanText,
  parseDecimal,
  slugify,
} from "../../scripts/import/map/text.mts";

describe("cleanText", () => {
  it("trims and collapses whitespace including non-breaking spaces", () => {
    expect(cleanText("  Höhe 8   mm ")).toBe("Höhe 8 mm");
  });
  it("maps empty, blank and missing values to null", () => {
    expect(cleanText("")).toBeNull();
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});

describe("cleanBlock", () => {
  it("keeps line breaks but trims lines and drops blank ones", () => {
    expect(cleanBlock(" Erste Zeile \n\n  Zweite Zeile ")).toBe(
      "Erste Zeile\nZweite Zeile"
    );
  });
  it("maps blank values to null", () => {
    expect(cleanBlock(" \n ")).toBeNull();
  });
});

describe("slugify", () => {
  it("transliterates German characters", () => {
    expect(slugify("Schließkeile mit Dämpfung")).toBe(
      "schliesskeile-mit-daempfung"
    );
    expect(slugify("Übergänge für Öffnungen")).toBe(
      "uebergaenge-fuer-oeffnungen"
    );
  });
  it("drops symbols and collapses separators", () => {
    expect(slugify("Wandhalter für Rohr Ø 15 mm (2-fach)")).toBe(
      "wandhalter-fuer-rohr-15-mm-2-fach"
    );
    expect(slugify("a_6010 Schließkeil")).toBe("a-6010-schliesskeil");
  });
  it("returns an empty string when nothing is left", () => {
    expect(slugify("Ø °")).toBe("");
  });
});

describe("parseDecimal", () => {
  it("accepts comma and point as decimal separator", () => {
    expect(parseDecimal("15,5")).toBe(15.5);
    expect(parseDecimal("9.5")).toBe(9.5);
    expect(parseDecimal("8")).toBe(8);
  });
});

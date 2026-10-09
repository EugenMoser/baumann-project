// @vitest-environment node
import { describe, expect, it } from "vitest";
import { splitMaterial } from "../../scripts/import/map/materials.mts";

describe("splitMaterial (FR-5, SC-5)", () => {
  it("maps a known code alone", () => {
    expect(splitMaterial("PA-6")).toEqual({
      code: "PA-6",
      note: null,
      fallback: false,
    });
    expect(splitMaterial("PC-ABS")).toEqual({
      code: "PC-ABS",
      note: null,
      fallback: false,
    });
  });
  it("maps CODE (qualifier)", () => {
    expect(splitMaterial("PA-6 (temperaturbeständig bis 100° C)")).toEqual({
      code: "PA-6",
      note: "temperaturbeständig bis 100° C",
      fallback: false,
    });
  });
  it("maps CODE qualifier", () => {
    expect(splitMaterial("PA-6 glasfaserverstärkt")).toEqual({
      code: "PA-6",
      note: "glasfaserverstärkt",
      fallback: false,
    });
  });
  it("normalises whitespace before matching", () => {
    expect(splitMaterial("  PP  glasfaserverstärkt ")).toEqual({
      code: "PP",
      note: "glasfaserverstärkt",
      fallback: false,
    });
  });
  it("falls back for several materials", () => {
    for (const text of [
      "PA-6 / ASA",
      "Wandteile: PA-6 / Blendenteile: ABS",
      "Topf: PA-6 Dämpfer: TPE",
      "Art.-Nr. 98108 (ABS) / Art.-Nr. 98148 (PP)",
    ]) {
      expect(splitMaterial(text)).toEqual({
        code: null,
        note: text,
        fallback: true,
      });
    }
  });
  it("falls back for an unknown code", () => {
    expect(splitMaterial("PEEK")).toEqual({
      code: null,
      note: "PEEK",
      fallback: true,
    });
  });
  it("yields nothing for an empty value", () => {
    expect(splitMaterial("")).toEqual({
      code: null,
      note: null,
      fallback: false,
    });
    expect(splitMaterial(null)).toEqual({
      code: null,
      note: null,
      fallback: false,
    });
  });
});

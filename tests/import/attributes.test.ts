// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ATTRIBUTES,
  parseFragment,
} from "../../scripts/import/map/attributes.mts";

const typed = (
  values: Record<string, number>,
  note: string | null = null,
  partial = false
) => ({
  kind: "typed",
  values: Object.entries(values).map(([key, value]) => ({ key, value })),
  note,
  partial,
});

describe("parseFragment rule table (FR-4, SC-4)", () => {
  it.each([
    ["Höhe 8 mm", { height: 8 }],
    ["Höhe: 15,5 mm", { height: 15.5 }],
    ["Fußhöhe 30 mm", { foot_height: 30 }],
    ["für 16 mm Plattenstärke", { panel_thickness: 16 }],
    ["für 19 mm Platte", { panel_thickness: 19 }],
    [
      "für Abwasserrohre Ø 40 mm Fußhöhe 30 mm",
      { pipe_diameter: 40, foot_height: 30 },
    ],
    [
      "für isolierte Abwasserrohre Ø 50 mm Fußhöhe 35 mm",
      { insulated_pipe_diameter: 50, foot_height: 35 },
    ],
    [
      "für Heizungsrohre Ø 15 mm Fußhöhe 20 mm",
      { pipe_diameter: 15, foot_height: 20 },
    ],
    ["für Rundrohr Ø 25 mm", { round_tube_diameter: 25 }],
    ["für Schlauch Ø 10 mm R 5 mm", { hose_diameter: 10, radius: 5 }],
    ["für Schlauch Ø 12 mm", { hose_diameter: 12 }],
    ["für Kabel Ø 8 mm", { cable_diameter: 8 }],
    ["für Leistenbreite 20 mm", { strip_width: 20 }],
    ["Tank-Bohrung 30 mm", { bore_diameter: 30 }],
    ["Höhe 8 mm und Ø 5 mm Bohrung", { height: 8, bore_diameter: 5 }],
    ["Einschubtiefe: 12 mm", { insertion_depth: 12 }],
    ["durch Stift Ø 6 mm", { pin_diameter: 6 }],
  ])("types %s", (text, values) => {
    expect(parseFragment(text)).toEqual(typed(values));
  });

  it("keeps the full text as note for pins with a length", () => {
    expect(parseFragment("Zapfen Ø 8 x 10 mm")).toEqual(
      typed({ pin_diameter: 8 }, "Zapfen Ø 8 x 10 mm")
    );
  });

  it("puts the remainder of a prefix rule into the note", () => {
    expect(parseFragment("Höhe 9,5 mm abgesetzt")).toEqual(
      typed({ height: 9.5 }, "abgesetzt", true)
    );
    expect(
      parseFragment("für Leistenbreite 20 mm (mit Positionierung)")
    ).toEqual(typed({ strip_width: 20 }, "(mit Positionierung)", true));
    expect(
      parseFragment("Höhe 8 mm und Ø 5 mm Bohrung (für doppelte Böden)")
    ).toEqual(
      typed({ height: 8, bore_diameter: 5 }, "(für doppelte Böden)", true)
    );
  });

  it("normalises whitespace before matching", () => {
    expect(parseFragment("Höhe 8  mm ")).toEqual(typed({ height: 8 }));
  });

  it("does not type a bare diameter", () => {
    expect(parseFragment("Ø 12 mm")).toEqual({
      kind: "unparsed",
      text: "Ø 12 mm",
    });
  });

  it("does not type whole-match rules with extra text", () => {
    expect(
      parseFragment(
        "durch Zapfen Ø 8 mm für Fahrzeugboden und Stift Ø 6 mm für Truhenwand"
      )
    ).toEqual({
      kind: "unparsed",
      text: "durch Zapfen Ø 8 mm für Fahrzeugboden und Stift Ø 6 mm für Truhenwand",
    });
  });

  it("does not type dimension triples or flags", () => {
    expect(parseFragment("40 x 30 x 20 mm").kind).toBe("unparsed");
    expect(parseFragment("ohne Positionierung").kind).toBe("unparsed");
  });

  it("respects word boundaries in prefix rules", () => {
    expect(parseFragment("für 19 mm Plattendicke")).toEqual({
      kind: "unparsed",
      text: "für 19 mm Plattendicke",
    });
    expect(parseFragment("Höhe 8 mmx")).toEqual({
      kind: "unparsed",
      text: "Höhe 8 mmx",
    });
  });

  it("recognises full sentences", () => {
    expect(
      parseFragment("Für die Montage wird ein Testwerkzeug benötigt.")
    ).toEqual({
      kind: "sentence",
      text: "Für die Montage wird ein Testwerkzeug benötigt.",
    });
  });

  it("defines every key used by a rule exactly once", () => {
    const keys = ATTRIBUTES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "height",
        "foot_height",
        "panel_thickness",
        "pipe_diameter",
        "insulated_pipe_diameter",
        "round_tube_diameter",
        "hose_diameter",
        "radius",
        "cable_diameter",
        "strip_width",
        "bore_diameter",
        "insertion_depth",
        "pin_diameter",
      ])
    );
    expect(
      ATTRIBUTES.every((a) => a.data_type === "decimal" && a.unit === "mm")
    ).toBe(true);
  });
});

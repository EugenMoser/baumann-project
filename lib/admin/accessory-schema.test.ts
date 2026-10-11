import { describe, expect, it } from "vitest";
import { parseAccessories, unknownNumberErrors } from "./accessory-schema";

describe("parseAccessories (SC-9, Review Focus 2)", () => {
  it("trims numbers and drops empty rows", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: " 99010 " }, { articleNumber: "" }],
      })
    ).toEqual({
      ok: true,
      value: { productId: 3, numbers: ["99010"], rows: [0] },
    });
  });
  it("reports a duplicate row", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: "99010" }, { articleNumber: " 99010" }],
      })
    ).toEqual({
      ok: false,
      fieldErrors: {
        "rows.1.articleNumber": "Dieser Artikel steht schon in der Liste.",
      },
    });
  });
  it("keeps slashes in article numbers", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: "99211/80" }],
      })
    ).toMatchObject({
      ok: true,
      value: { numbers: ["99211/80"] },
    });
  });
});

describe("unknownNumberErrors (SC-9)", () => {
  it("marks unknown numbers on their row", () => {
    expect(
      unknownNumberErrors(["99010", "nope"], new Map([["99010", 1]]))
    ).toEqual({
      "rows.1.articleNumber": "Diese Artikelnummer gibt es nicht.",
    });
  });
});

describe("parseAccessories validation", () => {
  it("keeps original row indexes across empty rows", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [
          { articleNumber: "" },
          { articleNumber: "A" },
          { articleNumber: " " },
          { articleNumber: "B" },
        ],
      })
    ).toMatchObject({ ok: true, value: { numbers: ["A", "B"], rows: [1, 3] } });
  });
  it("rejects over-long numbers and invalid product ids", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: "x".repeat(41) }],
      })
    ).toEqual({
      ok: false,
      fieldErrors: { "rows.0.articleNumber": "Höchstens 40 Zeichen." },
    });
    expect(parseAccessories({ productId: "0", rows: [] })).toMatchObject({
      ok: false,
      fieldErrors: { form: "Ungültiges Produkt." },
    });
  });
  it("maps unknown numbers to original rows", () => {
    expect(
      unknownNumberErrors(["A", "B"], new Map([["A", 1]]), [1, 3])
    ).toEqual({
      "rows.3.articleNumber": "Diese Artikelnummer gibt es nicht.",
    });
  });
});

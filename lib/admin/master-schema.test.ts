import { describe, expect, it } from "vitest";
import {
  colorSchema,
  emptyColorValues,
  emptyMaterialValues,
  materialSchema,
} from "./master-schema";

describe("colorSchema (SC-11, Review Focus 3)", () => {
  const valid = {
    ...emptyColorValues(),
    name: "weiß",
    hexCode: "#F4F4F4",
    family: "weiß",
  };
  it("accepts lower-case hex codes and stores them in upper case", () => {
    expect(colorSchema.parse(valid).hexCode).toBe("#F4F4F4");
    expect(colorSchema.parse({ ...valid, hexCode: "#a1b2c3" }).hexCode).toBe(
      "#A1B2C3"
    );
  });
  it.each(["#abc", "a1b2c3", "#GGGGGG", "#", ""])("rejects %s", (hexCode) => {
    const r = colorSchema.safeParse({ ...valid, hexCode });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toBe(
      "Bitte einen Farbcode wie #A1B2C3 eingeben."
    );
  });
  it("rejects an empty name and family; RAL is optional", () => {
    const r = colorSchema.safeParse({ ...valid, name: " ", family: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual([
      "Bitte einen Namen eingeben.",
      "Bitte eine Farbfamilie eingeben.",
    ]);
    expect(colorSchema.parse(valid).ralReference).toBeNull();
  });
});

describe("materialSchema (SC-11)", () => {
  it("rejects an empty code", () => {
    const r = materialSchema.safeParse({
      ...emptyMaterialValues(),
      name: "Polyamid",
    });
    expect(r.success ? "" : r.error.issues[0]?.message).toBe(
      "Bitte ein Kürzel eingeben."
    );
  });
  it("accepts code and name", () => {
    expect(materialSchema.parse({ code: " PA-6 ", name: "Polyamid" })).toEqual({
      code: "PA-6",
      name: "Polyamid",
    });
  });
});

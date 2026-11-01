import { describe, expect, it } from "vitest";
import { errorState } from "./form";

describe("errorState conflict messages", () => {
  const conflict = { kind: "conflict", field: "articleNumber" } as const;
  it("uses the default message for a conflict", () => {
    expect(errorState({}, conflict).fieldErrors).toEqual({
      articleNumber: "Diese Artikelnummer gibt es schon.",
    });
  });
  it("uses caller-supplied messages", () => {
    expect(
      errorState({}, conflict, { articleNumber: "Andere Meldung." }).fieldErrors
    ).toEqual({ articleNumber: "Andere Meldung." });
  });
  it("falls back to a generic message for an unknown field", () => {
    expect(errorState({}, conflict, {}).fieldErrors).toEqual({
      articleNumber: "Wert schon vergeben.",
    });
  });
});

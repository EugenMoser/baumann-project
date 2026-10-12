import { describe, expect, it } from "vitest";
import { errorState } from "./form";

describe("errorState conflict messages", () => {
  const conflict = { kind: "conflict", field: "slug" } as const;
  it("uses the default message for a conflict", () => {
    expect(errorState({}, conflict).fieldErrors).toEqual({
      slug: "Dieser Slug ist in der Kategorie schon vergeben.",
    });
  });
  it("uses caller-supplied messages", () => {
    expect(
      errorState({}, conflict, { slug: "Dieser Slug ist schon vergeben." })
        .fieldErrors
    ).toEqual({ slug: "Dieser Slug ist schon vergeben." });
  });
  it("falls back to a generic message for an unknown field", () => {
    expect(errorState({}, conflict, {}).fieldErrors).toEqual({
      slug: "Wert schon vergeben.",
    });
  });
});

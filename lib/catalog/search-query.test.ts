import { describe, expect, it } from "vitest";
import { parseSearchQuery, SEARCH_MAX } from "./search-query";

describe("parseSearchQuery (FR-8, SC-8)", () => {
  it("trims and accepts a normal query", () => {
    expect(parseSearchQuery("  Rohrschelle ")).toEqual({
      ok: true,
      value: "Rohrschelle",
    });
  });

  it("collapses inner whitespace", () => {
    expect(parseSearchQuery("6174   -  1")).toEqual({
      ok: true,
      value: "6174 - 1",
    });
  });

  it.each([undefined, "", "   "])("rejects %j as empty", (raw) => {
    expect(parseSearchQuery(raw)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a single character as too short", () => {
    expect(parseSearchQuery("a")).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects more than SEARCH_MAX characters", () => {
    expect(parseSearchQuery("x".repeat(SEARCH_MAX + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("uses the first value when the parameter repeats", () => {
    expect(parseSearchQuery(["Keil", "Rohr"])).toEqual({
      ok: true,
      value: "Keil",
    });
  });
});

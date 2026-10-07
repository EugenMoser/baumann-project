import { describe, expect, it } from "vitest";
import { hasNoindexHeader, isDeployed } from "./smoke-check.mts";

describe("isDeployed (FR-14)", () => {
  it("accepts the expected commit with a reachable database", () => {
    expect(isDeployed({ commit: "abc", db: "ok" }, "abc")).toBe(true);
  });

  it.each([
    ["an older commit", { commit: "old", db: "ok" }],
    ["a database error", { commit: "abc", db: "error" }],
    ["an unknown commit", { commit: "unknown", db: "ok" }],
    ["a malformed body", { status: "ok" }],
    ["null", null],
    ["a string", "ok"],
  ])("rejects %s", (_label, body) => {
    expect(isDeployed(body, "abc")).toBe(false);
  });
});

describe("hasNoindexHeader (FR-14)", () => {
  it("accepts the exact directive regardless of case and spacing", () => {
    expect(
      hasNoindexHeader(new Headers({ "X-Robots-Tag": "NoIndex,  NoFollow" }))
    ).toBe(true);
  });

  it.each([
    ["missing", new Headers()],
    ["noindex only", new Headers({ "X-Robots-Tag": "noindex" })],
  ])("rejects a header that is %s", (_label, headers) => {
    expect(hasNoindexHeader(headers)).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseOrderNumberParam } from "./variant-lookup";

describe("parseOrderNumberParam (FR-8, SC-8)", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["   ", null],
    [" 99010 - 1 ", "99010 - 1"],
    [["99010 - 1", "99011 - 2"], "99010 - 1"],
    ["x".repeat(41), null],
    ["x".repeat(500), null],
  ])("%j → %j (Review Focus 4)", (raw, expected) => {
    expect(parseOrderNumberParam(raw)).toBe(expected);
  });
});

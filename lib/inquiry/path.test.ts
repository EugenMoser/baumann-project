import { describe, expect, it } from "vitest";
import { inquiryPath } from "./path";

describe("inquiryPath (FR-13, SC-13)", () => {
  it.each([
    [undefined, "/anfrage"],
    [null, "/anfrage"],
    ["", "/anfrage"],
    ["99010 - 1", "/anfrage?bestellnummer=99010%20-%201"],
    ["99211/80 - 0", "/anfrage?bestellnummer=99211%2F80%20-%200"],
  ])("%j → %s", (number, expected) => {
    expect(inquiryPath(number)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT, userMessage } from "./prompt.ts";

describe("prompt (FR-8, SC-8)", () => {
  it("has the version string", () => {
    expect(PROMPT_VERSION).toBe("product-copy-v1");
  });

  it.each([
    "nur Fakten",
    "keine Preise",
    "keine Superlative",
    "250–600 Zeichen",
    "55 Zeichen",
    "140 Zeichen",
    "Wohnwagen",
    "Reisemobil",
  ])("system prompt contains %s", (phrase) => {
    expect(SYSTEM_PROMPT).toContain(phrase);
  });

  it("names the allowed typography", () => {
    expect(SYSTEM_PROMPT).toContain("Typografie:");
    expect(SYSTEM_PROMPT).toContain("nie —");
    expect(SYSTEM_PROMPT).toContain("nie das Auslassungszeichen …");
    expect(SYSTEM_PROMPT).toContain("keine Emojis");
    expect(SYSTEM_PROMPT).toContain("– „ “ ‚ ‘ × ° ± ⌀");
  });

  it("names the three output fields", () => {
    for (const field of ["description", "seoTitle", "seoDescription"]) {
      expect(SYSTEM_PROMPT).toContain(field);
    }
  });

  it("userMessage is the JSON block and nothing else", () => {
    const input = { a: 1, b: ["x", { c: null }] };
    expect(userMessage(input)).toBe(JSON.stringify(input, null, 2));
    expect(JSON.parse(userMessage(input))).toEqual(input);
  });
});

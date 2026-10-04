import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv (FR-6, SC-6)", () => {
  it("parses a valid https site URL", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SITE_URL: "https://baumann.eugen-moser.com",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://baumann.eugen-moser.com");
  });

  it("accepts http for local development", () => {
    expect(
      parseEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
        .NEXT_PUBLIC_SITE_URL
    ).toBe("http://localhost:3000");
  });

  it("throws a readable error naming the variable when it is missing", () => {
    expect(() => parseEnv({})).toThrow(
      /Invalid environment variables[\s\S]*NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws when the value is empty", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws when the value is not a URL", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws for a non-http protocol", () => {
    expect(() =>
      parseEnv({ NEXT_PUBLIC_SITE_URL: "ftp://example.com" })
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./schema";

// Builds a JWT-shaped string with the given payload (signature is irrelevant).
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const valid = {
  NEXT_PUBLIC_SITE_URL: "https://baumann.eugen-moser.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.baumann.eugen-moser.com",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

describe("parsePublicEnv (FR-1, SC-1)", () => {
  it("parses a complete valid environment", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("accepts http for local development", () => {
    const env = parsePublicEnv({
      ...valid,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it.each(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"])(
    "throws a readable error when %s is missing, empty, not a URL or not http(s)",
    (name) => {
      for (const value of [undefined, "", "not-a-url", "ftp://example.com"]) {
        expect(() => parsePublicEnv({ ...valid, [name]: value })).toThrow(
          new RegExp(`Invalid environment variables[\\s\\S]*${name}`)
        );
      }
    }
  );

  it("accepts a legacy anon JWT as publishable key", () => {
    const key = fakeJwt({ role: "anon", iss: "supabase" });
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ).toBe(key);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["a secret key", "sb_secret_abc123"],
    ["a service_role JWT", fakeJwt({ role: "service_role" })],
    ["a JWT without role", fakeJwt({ iss: "supabase" })],
    ["a malformed JWT", "eyJhbGciOiJIUzI1NiJ9.not-base64!.sig"],
    ["random text", "hello"],
  ])("rejects a publishable key that is %s", (_label, value) => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("parseServerEnv (FR-1)", () => {
  it("treats SOURCE_COMMIT as optional", () => {
    expect(parseServerEnv({})).toEqual({});
  });

  it("keeps a provided SOURCE_COMMIT", () => {
    expect(parseServerEnv({ SOURCE_COMMIT: "abc123" }).SOURCE_COMMIT).toBe(
      "abc123"
    );
  });

  it("treats an empty SOURCE_COMMIT as missing", () => {
    expect(parseServerEnv({ SOURCE_COMMIT: "" }).SOURCE_COMMIT).toBeUndefined();
  });
});

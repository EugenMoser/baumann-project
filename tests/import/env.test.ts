// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseImportEnv, parseRemoveEnv } from "../../scripts/import/env.mts";

const jwt = (role: string) =>
  [
    "e30",
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "sig",
  ].join(".");
const base = {
  IMPORT_SUPABASE_URL: "http://127.0.0.1:54321",
  IMPORT_SUPABASE_SECRET_KEY: "sb_secret_abc123",
  IMPORT_IMAGE_BASE_URL: "https://cdn.example.test/base",
};

describe("parseImportEnv (FR-1, SC-1)", () => {
  it("accepts a secret key and a legacy service_role JWT", () => {
    expect(parseImportEnv(base).ok).toBe(true);
    expect(
      parseImportEnv({
        ...base,
        IMPORT_SUPABASE_SECRET_KEY: jwt("service_role"),
      }).ok
    ).toBe(true);
  });

  it.each([["sb_publishable_abc123"], [jwt("anon")], ["not-a-key"]])(
    "rejects %s without echoing it",
    (key) => {
      const result = parseImportEnv({
        ...base,
        IMPORT_SUPABASE_SECRET_KEY: key,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("IMPORT_SUPABASE_SECRET_KEY");
        expect(result.error).not.toContain(key);
      }
    }
  );

  it("rejects missing or invalid URLs", () => {
    const missing = parseImportEnv({
      ...base,
      IMPORT_IMAGE_BASE_URL: undefined,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("IMPORT_IMAGE_BASE_URL");
    expect(parseImportEnv({ ...base, IMPORT_SUPABASE_URL: "ftp://x" }).ok).toBe(
      false
    );
  });
});

describe("parseRemoveEnv (FR-12)", () => {
  it("does not need the image base URL", () => {
    expect(
      parseRemoveEnv({ ...base, IMPORT_IMAGE_BASE_URL: undefined }).ok
    ).toBe(true);
  });
});

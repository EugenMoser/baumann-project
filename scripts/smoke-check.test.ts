import { describe, expect, it } from "vitest";
import {
  authFailure,
  basicAuthHeaders,
  hasNoindexHeader,
  isDeployed,
} from "./smoke-check.mts";

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

describe("basicAuthHeaders", () => {
  it.each([
    ["unset", undefined],
    ["an empty secret", ""],
  ])("sends no header when the credentials are %s", (_label, credentials) => {
    expect(basicAuthHeaders(credentials)).toEqual({});
  });

  it.each([
    ["admin:s3cret", "Basic YWRtaW46czNjcmV0"],
    ["admin:pa:ss", "Basic YWRtaW46cGE6c3M="],
  ])("encodes %s", (credentials, expected) => {
    expect(basicAuthHeaders(credentials)).toEqual({ Authorization: expected });
  });

  it.each(["admin", ":s3cret", "admin:"])(
    "rejects %s without echoing it",
    (credentials) => {
      expect(() => basicAuthHeaders(credentials)).toThrow(
        /^PREVIEW_BASIC_AUTH must be user:password$/
      );
    }
  );
});

describe("authFailure", () => {
  it.each([200, 404, 503])("ignores status %i", (status) => {
    expect(authFailure(status, true)).toBeNull();
  });

  it("reports rejected credentials", () => {
    expect(authFailure(401, true)).toBe(
      "The preview rejected PREVIEW_BASIC_AUTH (401)."
    );
  });

  it("reports missing credentials", () => {
    expect(authFailure(401, false)).toBe(
      "The preview requires basic auth, but PREVIEW_BASIC_AUTH is not set (401)."
    );
  });
});

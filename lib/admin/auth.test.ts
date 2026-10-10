import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_HOME,
  checkAdmin,
  classifyClaims,
  loginPathFor,
  safeNext,
} from "./auth";
import type { AdminClient } from "@/lib/supabase/session";

vi.mock("server-only", () => ({}));

describe("classifyClaims (SC-1)", () => {
  it("admin claims → admin", () => {
    expect(
      classifyClaims({
        sub: "u1",
        email: "a@example.com",
        app_metadata: { role: "admin" },
      })
    ).toEqual({ kind: "admin", userId: "u1", email: "a@example.com" });
  });
  it("claims without admin role → forbidden", () => {
    expect(classifyClaims({ sub: "u2", app_metadata: {} })).toEqual({
      kind: "forbidden",
      email: null,
    });
    expect(
      classifyClaims({ sub: "u2", user_metadata: { role: "admin" } })
    ).toEqual({ kind: "forbidden", email: null });
  });
  it("no claims → anonymous", () => {
    expect(classifyClaims(null)).toEqual({ kind: "anonymous" });
    expect(classifyClaims({})).toEqual({ kind: "anonymous" });
  });
});

describe("checkAdmin", () => {
  const client = (result: unknown) =>
    ({
      auth: { getClaims: vi.fn().mockResolvedValue(result) },
    }) as unknown as AdminClient;
  it("maps an auth error to anonymous", async () => {
    expect(
      await checkAdmin(client({ data: null, error: new Error("x") }))
    ).toEqual({ kind: "anonymous" });
  });
  it("classifies returned claims", async () => {
    const result = {
      data: { claims: { sub: "u1", app_metadata: { role: "admin" } } },
      error: null,
    };
    expect((await checkAdmin(client(result))).kind).toBe("admin");
  });
});

describe("safeNext (SC-2)", () => {
  it.each([
    "/admin/produkte/3",
    "/admin/produkte?status=draft",
    "/admin/login-verlauf",
  ])("accepts %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });
  it.each([
    "//evil.example",
    "https://evil.example/admin/x",
    "/produkte",
    "/admin",
    "/admin/login",
    "/admin/..//evil.example",
    "/admin\\evil",
    "\t//evil.example",
    "/admin/%2e%2e//evil",
    "/admin/login?x=1",
    "/admin/login/",
    null,
    42,
  ])("rejects %s", (value) => {
    expect(safeNext(value)).toBe(ADMIN_HOME);
  });
  it("builds the login path with an encoded next", () => {
    expect(loginPathFor("/admin/produkte")).toBe(
      "/admin/login?next=%2Fadmin%2Fprodukte"
    );
  });
});

// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

type CookieWriter = {
  setAll: (
    list: { name: string; value: string; options: object }[],
    headers: Record<string, string>
  ) => void;
};

// The Supabase client clears an invalid session cookie through setAll, then
// reports no claims.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: CookieWriter }
  ) => ({
    auth: {
      getClaims: async () => {
        opts.cookies.setAll(
          [
            {
              name: "sb-test-auth-token",
              value: "",
              options: { path: "/", maxAge: 0 },
            },
          ],
          { "Cache-Control": "private, no-store" }
        );
        return { data: null, error: null };
      },
    },
  }),
}));

describe("proxy", () => {
  it("keeps cookies and headers from setAll on the login redirect", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/admin/produkte")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/admin/login?next=%2Fadmin%2Fprodukte"
    );
    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie).toMatchObject({ value: "", path: "/", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

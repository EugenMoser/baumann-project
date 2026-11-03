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

  // Review Focus 5: the editor's fetch needs JSON, not the login page.
  it("answers the suggestion route with 401 JSON and keeps cookies and headers", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/admin/produkte/12/ki-vorschlag", {
        method: "POST",
      })
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({ error: "Bitte neu anmelden." });
    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie).toMatchObject({ value: "", path: "/", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "/admin/produkte/12/ki-vorschlag/x",
    "/admin/produkte/abc/ki-vorschlag",
    "/admin/produkte/12",
  ])("still redirects %s to the login page", async (path) => {
    const response = await proxy(
      new NextRequest(`http://localhost:3000${path}`)
    );
    expect(response.status).toBe(307);
  });
});

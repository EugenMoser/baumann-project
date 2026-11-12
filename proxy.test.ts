// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_NOT_FOUND_PATH } from "@/lib/catalog/not-found-path";
import { config, proxy } from "./proxy";

type CookieWriter = {
  setAll: (
    list: { name: string; value: string; options: object }[],
    headers: Record<string, string>
  ) => void;
};

const mocks = vi.hoisted(() => ({
  isKnown: vi.fn<(category: string, product?: string) => Promise<boolean>>(),
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/catalog/known-slugs", () => ({
  knownSlugs: { isKnown: mocks.isKnown },
}));

// The Supabase client clears an invalid session cookie through setAll, then
// reports no claims.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    key: string,
    opts: { cookies: CookieWriter }
  ) => (
    mocks.createServerClient(url, key),
    {
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
    }
  ),
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

  describe("catalog routes", () => {
    const get = (path: string) =>
      proxy(new NextRequest(`http://localhost:3000${path}`));

    beforeEach(() => {
      mocks.isKnown.mockReset();
      mocks.createServerClient.mockReset();
    });

    it("rewrites an unknown product to the fixed not-found path", async () => {
      mocks.isKnown.mockResolvedValue(false);
      const response = await get("/produkte/moebelteile/zufall-123");
      expect(mocks.isKnown).toHaveBeenCalledWith("moebelteile", "zufall-123");
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        new URL(CATALOG_NOT_FOUND_PATH, "http://localhost:3000").toString()
      );
    });

    it("rewrites an unknown category to the fixed not-found path", async () => {
      mocks.isKnown.mockResolvedValue(false);
      const response = await get("/produkte/zufall");
      expect(mocks.isKnown).toHaveBeenCalledWith("zufall", undefined);
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        new URL(CATALOG_NOT_FOUND_PATH, "http://localhost:3000").toString()
      );
    });

    it("uses the same rewrite target for different random URLs", async () => {
      mocks.isKnown.mockResolvedValue(false);
      const a = await get("/produkte/a/b");
      const b = await get("/produkte/c");
      expect(a.headers.get("x-middleware-rewrite")).toBe(
        b.headers.get("x-middleware-rewrite")
      );
    });

    it("passes a known product through", async () => {
      mocks.isKnown.mockResolvedValue(true);
      const response = await get("/produkte/moebelteile/testkeil");
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("passes a known category through", async () => {
      mocks.isKnown.mockResolvedValue(true);
      const response = await get("/produkte/moebelteile");
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("passes a trailing-slash category URL through as that category", async () => {
      mocks.isKnown.mockResolvedValue(true);
      await get("/produkte/moebelteile/");
      expect(mocks.isKnown).toHaveBeenCalledWith("moebelteile", undefined);
    });

    it("does not look up /produkte itself", async () => {
      const response = await get("/produkte");
      expect(mocks.isKnown).not.toHaveBeenCalled();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("does not look up paths with three or more segments", async () => {
      const response = await get("/produkte/a/b/c");
      expect(mocks.isKnown).not.toHaveBeenCalled();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("decodes percent-encoded segments before the lookup", async () => {
      mocks.isKnown.mockResolvedValue(true);
      await get("/produkte/m%C3%B6bel/teil%2Dx");
      expect(mocks.isKnown).toHaveBeenCalledWith("möbel", "teil-x");
    });

    it("treats a segment that fails to decode as unknown", async () => {
      mocks.isKnown.mockResolvedValue(true);
      const response = await get("/produkte/%E0%A4%A");
      expect(mocks.isKnown).not.toHaveBeenCalled();
      expect(response.headers.get("x-middleware-rewrite")).toContain(
        CATALOG_NOT_FOUND_PATH
      );
    });

    it.each(["/produkte", "/produkte/a", "/produkte/a/b", "/produkte/a/b/c"])(
      "never creates the session client or sets cookies on %s (SC-1)",
      async (path) => {
        mocks.isKnown.mockResolvedValue(false);
        const response = await get(path);
        expect(mocks.createServerClient).not.toHaveBeenCalled();
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.cookies.getAll()).toEqual([]);
      }
    );

    it("never looks up slugs for an admin request", async () => {
      await get("/admin/produkte/12");
      expect(mocks.isKnown).not.toHaveBeenCalled();
    });

    // The matcher also matches encoded variants of /produkte; they must not
    // pass through unchecked to the ISR pages.
    it("sends an encoded /produkte variant to the admin branch, not through", async () => {
      const response = await get("/produkt%65/x");
      expect(mocks.isKnown).not.toHaveBeenCalled();
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(response.status).toBe(307);
    });

    it("matches /admin and /produkte paths", () => {
      expect(config.matcher).toEqual(
        expect.arrayContaining(["/admin/:path*", "/produkte/:path*"])
      );
    });
  });
});

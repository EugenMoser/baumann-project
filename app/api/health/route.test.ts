import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({ serverEnv: { SOURCE_COMMIT: "abc123" } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({}) }));
vi.mock("@/lib/health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/health")>();
  return { ...actual, supabaseProbe: () => async () => false };
});

describe("GET /api/health (FR-11, SC-11)", () => {
  it("answers 200 with commit and db status, never cached", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ commit: "abc123", db: "error" });
  });
});

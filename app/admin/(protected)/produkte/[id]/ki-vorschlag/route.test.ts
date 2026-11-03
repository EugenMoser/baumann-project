// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCheck } from "@/lib/admin/auth";
import type { GenerateError } from "@/lib/ai/generate";

const mocks = vi.hoisted(() => ({
  env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
  checkAdmin: vi.fn(),
  generateCopy: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({ publicEnv: mocks.env }));
vi.mock("@/lib/supabase/session", () => ({
  createSessionSupabase: async () => ({ fake: "client" }),
}));
vi.mock("@/lib/admin/auth", () => ({ checkAdmin: mocks.checkAdmin }));
vi.mock("@/lib/ai/server", () => ({
  generationDeps: (client: unknown) => ({ client, settings: {}, tiers: [] }),
}));
vi.mock("@/lib/ai/generate", () => ({ generateCopy: mocks.generateCopy }));

import { POST } from "./route";

const admin: AdminCheck = { kind: "admin", userId: "u1", email: "a@b.c" };

function post(
  headers: Record<string, string> = {},
  site = "http://localhost:3000"
): Request {
  return new Request(`${site}/admin/produkte/7/ki-vorschlag`, {
    method: "POST",
    headers: {
      Origin: site,
      "Content-Type": "application/json",
      ...headers,
    },
    body: "{}",
  });
}

const ctx = (id = "7") => ({ params: Promise.resolve({ id }) });

const success = {
  ok: true,
  value: {
    model: "fake",
    suggestions: [
      { field: "description", generationId: 1, text: "Beschreibung." },
      { field: "seo_title", generationId: 2, text: "Titel" },
      { field: "seo_description", generationId: 3, text: "SEO-Text." },
    ],
  },
};

describe("POST /admin/produkte/[id]/ki-vorschlag (FR-1, SC-1)", () => {
  beforeEach(() => {
    mocks.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    mocks.checkAdmin.mockResolvedValue(admin);
    mocks.generateCopy.mockResolvedValue(success);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns the suggestions as JSON for an admin", async () => {
    const response = await POST(post(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success.value);
    expect(mocks.generateCopy).toHaveBeenCalledWith(
      { client: { fake: "client" }, settings: {}, tiers: [] },
      7
    );
  });

  it("answers 401 with the login hint for an expired session", async () => {
    mocks.checkAdmin.mockResolvedValue({ kind: "anonymous" });
    const response = await POST(post(), ctx());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Bitte neu anmelden." });
    expect(mocks.generateCopy).not.toHaveBeenCalled();
  });

  it("answers 403 for a signed-in non-admin", async () => {
    mocks.checkAdmin.mockResolvedValue({ kind: "forbidden", email: null });
    const response = await POST(post(), ctx());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Keine Berechtigung." });
    expect(mocks.generateCopy).not.toHaveBeenCalled();
  });

  it.each([
    ["a foreign origin", { Origin: "https://evil.example" }],
    ["a malformed origin", { Origin: "http://localhost:4000x" }],
    ["the literal null origin", { Origin: "null" }],
  ])("rejects %s with 403", async (_, headers) => {
    const response = await POST(post(headers), ctx());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Ungültige Anfrage." });
    expect(mocks.generateCopy).not.toHaveBeenCalled();
  });

  it("rejects a request without an Origin header", async () => {
    const request = post();
    request.headers.delete("origin");
    const response = await POST(request, ctx());
    expect(response.status).toBe(403);
    expect(mocks.generateCopy).not.toHaveBeenCalled();
  });

  it.each([["text/plain"], ["application/x-www-form-urlencoded"], [""]])(
    "rejects content type %j with 415",
    async (type) => {
      const request = post({ "Content-Type": type });
      if (!type) request.headers.delete("content-type");
      const response = await POST(request, ctx());
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "Ungültige Anfrage." });
      expect(mocks.generateCopy).not.toHaveBeenCalled();
    }
  );

  it("accepts a JSON content type with a charset", async () => {
    const response = await POST(
      post({ "Content-Type": "application/json; charset=utf-8" }),
      ctx()
    );
    expect(response.status).toBe(200);
  });

  it.each(["0", "-1", "abc", "7.5", "07", "12345678901"])(
    "rejects the product id %j with 400",
    async (id) => {
      const response = await POST(post(), ctx(id));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Ungültige Anfrage." });
      expect(mocks.generateCopy).not.toHaveBeenCalled();
    }
  );

  describe("origin rule (R8)", () => {
    it("accepts the 127.0.0.1 twin on any port when the site URL is loopback", async () => {
      const response = await POST(
        post({ Origin: "http://127.0.0.1:3100" }),
        ctx()
      );
      expect(response.status).toBe(200);
    });

    it("accepts localhost on another port when the site URL is 127.0.0.1", async () => {
      mocks.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3100";
      const response = await POST(
        post({ Origin: "http://localhost:3000" }),
        ctx()
      );
      expect(response.status).toBe(200);
    });

    it("rejects an https loopback origin and a loopback-looking host", async () => {
      for (const origin of [
        "https://localhost:3000",
        "http://localhost.evil.example",
      ]) {
        const response = await POST(post({ Origin: origin }), ctx());
        expect(response.status).toBe(403);
      }
    });

    it("accepts only the exact site origin on a production-like site URL", async () => {
      mocks.env.NEXT_PUBLIC_SITE_URL = "https://catalog.example.com/";
      const site = "https://catalog.example.com";
      expect((await POST(post({}, site), ctx())).status).toBe(200);
      for (const origin of [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://catalog.example.com",
        "https://other.example.com",
      ]) {
        const response = await POST(post({ Origin: origin }, site), ctx());
        expect(response.status).toBe(403);
      }
      expect(mocks.generateCopy).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ["not_found", 404, "Produkt nicht gefunden."],
    [
      "monthly_cap",
      429,
      "Das monatliche Kontingent für KI-Vorschläge ist aufgebraucht.",
    ],
    [
      "hourly_limit",
      429,
      "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen.",
    ],
    ["not_set_up", 409, "Der KI-Assistent ist nicht eingerichtet."],
    ["draft_needs_fallback", 409, "Für Entwürfe ist kein Modell eingerichtet."],
    [
      "failed",
      502,
      "Es konnte kein brauchbarer Vorschlag erstellt werden. Bitte später erneut versuchen.",
    ],
    [
      "db_error",
      500,
      "Der Vorschlag konnte nicht erstellt werden. Bitte später erneut versuchen.",
    ],
  ] as [GenerateError, number, string][])(
    "maps %s to %i with its German text and logs only the kind",
    async (error, status, text) => {
      mocks.generateCopy.mockResolvedValue({ ok: false, error });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await POST(post(), ctx());
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: text });
      expect(log).toHaveBeenCalledWith("[ai] generate failed:", error);
    }
  );

  it("answers JSON when the service throws", async () => {
    mocks.generateCopy.mockRejectedValue(new Error("provider key sk-123"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(post(), ctx());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error:
        "Der Vorschlag konnte nicht erstellt werden. Bitte später erneut versuchen.",
    });
    expect(log).toHaveBeenCalledWith("[ai] generate failed:", "unexpected");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk-123");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import { finishRequest, reserveRequest } from "./limits.ts";

const settings = { monthlyCap: 200, hourlyLimit: 20 };

function rpcClient(result: { data: unknown; error: unknown }) {
  const calls: { fn?: string; args?: unknown } = {};
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.fn = fn;
      calls.args = args;
      return result;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

function updateClient(eq: () => Promise<{ error: unknown }>) {
  const calls: { table?: string; values?: unknown; id?: number } = {};
  const client = {
    from: (table: string) => {
      calls.table = table;
      return {
        update: (values: unknown) => {
          calls.values = values;
          return {
            eq: (_: string, id: number) => {
              calls.id = id;
              return eq();
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe("reserveRequest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes the product and both limits and returns the request id", async () => {
    const { client, calls } = rpcClient({ data: 42, error: null });
    expect(await reserveRequest(client, 7, settings)).toEqual({
      ok: true,
      value: 42,
    });
    expect(calls).toEqual({
      fn: "reserve_ai_request",
      args: { p_product_id: 7, p_monthly_cap: 200, p_hourly_limit: 20 },
    });
  });

  it.each([
    ["AI001", "monthly_cap"],
    ["AI002", "hourly_limit"],
    ["42501", "db_error"],
    ["22023", "db_error"],
    [undefined, "db_error"],
  ])("maps error code %s to %s", async (code, error) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = rpcClient({ data: null, error: { code, message: "x" } });
    expect(await reserveRequest(client, 7, settings)).toEqual({
      ok: false,
      error,
    });
  });

  it("logs only the code of an unexpected database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = rpcClient({
      data: null,
      error: { code: "42501", message: "permission denied", details: "d" },
    });
    await reserveRequest(client, 7, settings);
    expect(log).toHaveBeenCalledWith("[ai] reserve request failed:", "42501");
    expect(JSON.stringify(log.mock.calls)).not.toContain("permission denied");
  });

  it.each(["AI001", "AI002"])(
    "does not log the limit error %s",
    async (code) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = rpcClient({
        data: null,
        error: { code, message: "x" },
      });
      await reserveRequest(client, 7, settings);
      expect(log).not.toHaveBeenCalled();
    }
  );

  it("treats a missing id as a database error", async () => {
    const { client } = rpcClient({ data: null, error: null });
    expect(await reserveRequest(client, 7, settings)).toEqual({
      ok: false,
      error: "db_error",
    });
  });
});

describe("finishRequest", () => {
  afterEach(() => vi.restoreAllMocks());

  const outcome = {
    status: "succeeded",
    model: "claude-haiku-5-5",
    inputTokens: 120,
    outputTokens: 80,
  } as const;

  it("stores status, model and token counts on the request", async () => {
    const { client, calls } = updateClient(async () => ({ error: null }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await finishRequest(client, 42, outcome);
    expect(calls).toEqual({
      table: "ai_request",
      values: {
        status: "succeeded",
        model: "claude-haiku-5-5",
        input_tokens: 120,
        output_tokens: 80,
      },
      id: 42,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs only the code and message of a database error", async () => {
    const { client } = updateClient(async () => ({
      error: { code: "42501", message: "permission denied", details: "d" },
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      finishRequest(client, 42, {
        status: "failed",
        model: null,
        inputTokens: null,
        outputTokens: null,
      })
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "[ai] finish request failed:",
      "42501",
      "permission denied"
    );
  });

  it("never throws, even when the client rejects", async () => {
    const { client } = updateClient(async () => {
      throw new Error("secret provider text");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(finishRequest(client, 42, outcome)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[ai] finish request failed:", "Error");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});

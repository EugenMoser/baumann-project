import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import type { Tier, TierAnswer } from "./chain.ts";
import { generateCopy } from "./generate.ts";
import { PROMPT_VERSION } from "./product-copy/prompt.ts";
import type { AiSettings } from "./settings.ts";

const full: AiSettings = {
  openRouterKey: "or-key",
  freeModels: ["free/a"],
  anthropicKey: "an-key",
  fallbackModel: "claude-haiku-5-5",
  monthlyCap: 200,
  hourlyLimit: 20,
  fake: false,
};
const freeOnly: AiSettings = { ...full, anthropicKey: null };
const none: AiSettings = { ...full, anthropicKey: null, openRouterKey: null };

const sentence = "Das Formteil wird aus Polypropylen gespritzt.";
const draft = {
  description: sentence.repeat(2),
  seoTitle: "Formteil aus Polypropylen für Reisemobile",
  seoDescription: "Formteil aus Polypropylen für Wohnwagen und Reisemobile.",
};

function productRow(status: "draft" | "published" | "archived") {
  return {
    id: 7,
    status,
    name: "Dachhaube",
    subtitle: null,
    description: null,
    material_note: null,
    category: { name: "Dachhauben" },
    material: null,
    article: [],
    product_color: [],
  };
}

type Call = { table: string; op: string; values?: unknown; id?: number };

// Records every table operation; nothing may write to `product`.
function fakeClient(opts: {
  product?: { data: unknown; error: unknown };
  reserve?: { data: unknown; error: unknown };
  insertError?: unknown;
}) {
  const calls: Call[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];
  let nextId = 100;
  const client = {
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return opts.reserve ?? { data: 42, error: null };
    },
    from: (table: string) => {
      const record = (op: string, values?: unknown) => {
        const call: Call = { table, op, values };
        calls.push(call);
        return call;
      };
      return {
        select: () => {
          record("select");
          const chain = {
            eq: () => chain,
            maybeSingle: async () =>
              opts.product ?? { data: productRow("published"), error: null },
          };
          return chain;
        },
        insert: (values: { field: string }[]) => {
          record("insert", values);
          return {
            select: async () =>
              opts.insertError
                ? { data: null, error: opts.insertError }
                : {
                    data: values.map((v) => ({ id: nextId++, field: v.field })),
                    error: null,
                  },
          };
        },
        update: (values: unknown) => {
          const call = record("update", values);
          return {
            eq: async (_: string, id: number) => {
              call.id = id;
              return { error: null };
            },
          };
        },
        upsert: (values: unknown) => record("upsert", values),
        delete: () => record("delete"),
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls, rpcs };
}

function tier(kind: Tier["kind"], model: string, raw: unknown = draft) {
  const calls: string[] = [];
  const t: Tier = {
    kind,
    model,
    timeoutMs: 1000,
    call: async (): Promise<TierAnswer> => {
      calls.push(model);
      return { raw, model, inputTokens: 120, outputTokens: 80 };
    },
  };
  return { t, calls };
}

function failing(kind: Tier["kind"], model: string): Tier {
  return {
    kind,
    model,
    timeoutMs: 1000,
    call: async () => {
      throw new Error("provider said: secret detail");
    },
  };
}

const writesTo = (calls: Call[], table: string) =>
  calls.filter((c) => c.table === table && c.op !== "select");

describe("generateCopy (FR-1, FR-6, FR-8)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses without a usable tier before touching the database", async () => {
    const { client, calls, rpcs } = fakeClient({});
    const anthropic = tier("anthropic", "claude-haiku-5-5");
    const result = await generateCopy(
      { client, settings: none, tiers: [anthropic.t] },
      7
    );
    expect(result).toEqual({ ok: false, error: "not_set_up" });
    expect(calls).toEqual([]);
    expect(rpcs).toEqual([]);
    expect(anthropic.calls).toEqual([]);
  });

  it("reports a missing product without reserving a request", async () => {
    const { client, rpcs } = fakeClient({
      product: { data: null, error: null },
    });
    const result = await generateCopy({ client, settings: full, tiers: [] }, 7);
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(rpcs).toEqual([]);
  });

  it("maps a failed product load to a database error", async () => {
    const { client, rpcs } = fakeClient({
      product: { data: null, error: { code: "08006", message: "x" } },
    });
    const result = await generateCopy({ client, settings: full, tiers: [] }, 7);
    expect(result).toEqual({ ok: false, error: "db_error" });
    expect(rpcs).toEqual([]);
  });

  it.each(["draft", "archived"] as const)(
    "needs the fallback for a %s product when only free models are set up",
    async (status) => {
      const { client, rpcs } = fakeClient({
        product: { data: productRow(status), error: null },
      });
      const free = tier("free", "free/a");
      const result = await generateCopy(
        { client, settings: freeOnly, tiers: [free.t] },
        7
      );
      expect(result).toEqual({ ok: false, error: "draft_needs_fallback" });
      expect(rpcs).toEqual([]);
      expect(free.calls).toEqual([]);
    }
  );

  it.each([
    ["AI001", "monthly_cap"],
    ["AI002", "hourly_limit"],
    ["42501", "db_error"],
  ])(
    "stops on reservation error %s with %s before any model call",
    async (code, error) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { client, calls } = fakeClient({
        reserve: { data: null, error: { code, message: "x" } },
      });
      const anthropic = tier("anthropic", "claude-haiku-5-5");
      const result = await generateCopy(
        { client, settings: full, tiers: [anthropic.t] },
        7
      );
      expect(result).toEqual({ ok: false, error });
      expect(anthropic.calls).toEqual([]);
      expect(writesTo(calls, "ai_generation")).toEqual([]);
    }
  );

  it("writes three audit rows, finishes the request and returns the suggestions", async () => {
    const { client, calls, rpcs } = fakeClient({});
    const anthropic = tier("anthropic", "claude-haiku-5-5");
    const result = await generateCopy(
      { client, settings: full, tiers: [anthropic.t] },
      7
    );

    expect(rpcs).toEqual([
      {
        fn: "reserve_ai_request",
        args: { p_product_id: 7, p_monthly_cap: 200, p_hourly_limit: 20 },
      },
    ]);
    const base = {
      entity: "product",
      entity_id: 7,
      model: "claude-haiku-5-5",
      prompt_version: PROMPT_VERSION,
      request_id: 42,
    };
    expect(writesTo(calls, "ai_generation")).toEqual([
      {
        table: "ai_generation",
        op: "insert",
        values: [
          { ...base, field: "description", output: draft.description },
          { ...base, field: "seo_title", output: draft.seoTitle },
          { ...base, field: "seo_description", output: draft.seoDescription },
        ],
      },
    ]);
    expect(writesTo(calls, "ai_request")).toEqual([
      {
        table: "ai_request",
        op: "update",
        values: {
          status: "succeeded",
          model: "claude-haiku-5-5",
          input_tokens: 120,
          output_tokens: 80,
        },
        id: 42,
      },
    ]);
    expect(writesTo(calls, "product")).toEqual([]);
    expect(result).toEqual({
      ok: true,
      value: {
        model: "claude-haiku-5-5",
        suggestions: [
          { field: "description", generationId: 100, text: draft.description },
          { field: "seo_title", generationId: 101, text: draft.seoTitle },
          {
            field: "seo_description",
            generationId: 102,
            text: draft.seoDescription,
          },
        ],
      },
    });
  });

  it("sends a draft past the free models", async () => {
    const { client } = fakeClient({
      product: { data: productRow("draft"), error: null },
    });
    const free = tier("free", "free/a");
    const anthropic = tier("anthropic", "claude-haiku-5-5");
    const result = await generateCopy(
      { client, settings: full, tiers: [free.t, anthropic.t] },
      7
    );
    expect(result.ok).toBe(true);
    expect(free.calls).toEqual([]);
    expect(anthropic.calls).toEqual(["claude-haiku-5-5"]);
  });

  it("marks the request failed when every tier fails", async () => {
    const { client, calls } = fakeClient({});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generateCopy(
      {
        client,
        settings: full,
        tiers: [failing("free", "free/a"), failing("anthropic", "claude")],
      },
      7
    );
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(writesTo(calls, "ai_generation")).toEqual([]);
    expect(writesTo(calls, "ai_request")).toEqual([
      {
        table: "ai_request",
        op: "update",
        values: {
          status: "failed",
          model: null,
          input_tokens: null,
          output_tokens: null,
        },
        id: 42,
      },
    ]);
    expect(writesTo(calls, "product")).toEqual([]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret detail");
  });

  it("marks the request failed and reports a database error when the audit insert fails", async () => {
    const { client, calls } = fakeClient({
      insertError: { code: "42501", message: "denied" },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const anthropic = tier("anthropic", "claude-haiku-5-5");
    const result = await generateCopy(
      { client, settings: full, tiers: [anthropic.t] },
      7
    );
    expect(result).toEqual({ ok: false, error: "db_error" });
    expect(log).toHaveBeenCalledWith("[ai] save suggestions failed:", "42501");
    expect(writesTo(calls, "ai_request")).toEqual([
      {
        table: "ai_request",
        op: "update",
        values: {
          status: "failed",
          model: "claude-haiku-5-5",
          input_tokens: 120,
          output_tokens: 80,
        },
        id: 42,
      },
    ]);
    expect(writesTo(calls, "product")).toEqual([]);
  });
});

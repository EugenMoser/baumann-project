// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tier } from "../../lib/ai/chain.ts";
import type { AiSettings } from "../../lib/ai/settings.ts";
import { parseTryArgs, runTry, type CliIo } from "./try.mts";

const LOCAL = "http://127.0.0.1:54321";
const REMOTE = "https://db.example.test";
const SERVICE = "service-role-key-value";
const PUBLISHABLE = "publishable-key-value";

let logs: string[];
let errors: string[];
let io: CliIo;

beforeEach(() => {
  logs = [];
  errors = [];
  io = { log: (l) => logs.push(l), error: (l) => errors.push(l) };
});

function productRow(status: "draft" | "published") {
  return {
    id: 7,
    status,
    name: "Dachhaube",
    subtitle: null,
    description: null,
    material_note: null,
    category: { name: "Dach" },
    material: null,
    article: [],
    product_color: [],
  };
}

function fakeClient(status: "draft" | "published" = "published") {
  const writes = vi.fn();
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () =>
      Promise.resolve({ data: productRow(status), error: null }),
    insert: writes,
    update: writes,
  };
  const client = { from: () => builder, rpc: writes };
  return { client: client as unknown as SupabaseClient, writes };
}

const GOOD = {
  description:
    "Die Dachhaube schützt den Aufbau zuverlässig vor Regen und Schmutz und lässt sich einfach montieren.",
  seoTitle: "Dachhaube für Wohnwagen",
  seoDescription:
    "Dachhaube für den Wohnwagen, wetterfest und leicht zu montieren.",
};

function tier(kind: Tier["kind"], model: string, raw: unknown): Tier {
  return {
    kind,
    model,
    timeoutMs: 1000,
    call: () =>
      raw instanceof Error
        ? Promise.reject(raw)
        : Promise.resolve({
            raw,
            model,
            inputTokens: null,
            outputTokens: null,
          }),
  };
}

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: LOCAL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
};

describe("parseTryArgs", () => {
  it("parses product, model and flag", () => {
    expect(
      parseTryArgs(["--product", "12", "--model", "x/y:free", "--allow-remote"])
    ).toEqual({ productId: 12, model: "x/y:free", allowRemote: true });
    expect(parseTryArgs(["--", "--product", "3"])).toEqual({
      productId: 3,
      model: null,
      allowRemote: false,
    });
  });

  it.each([
    ["missing id", []],
    ["non-numeric id", ["--product", "abc"]],
    ["zero", ["--product", "0"]],
    ["fraction", ["--product", "1.5"]],
    ["unknown flag", ["--product", "1", "--nope"]],
    ["empty model", ["--product", "1", "--model", ""]],
  ])("rejects %s", (_label, argv) => {
    expect(parseTryArgs(argv)).toHaveProperty("error");
  });
});

describe("runTry", () => {
  it("prints the usage and exits 2 on bad arguments", async () => {
    expect(await runTry(io, baseEnv, [])).toBe(2);
    expect(errors.join("\n")).toContain(
      "usage: pnpm ai:try --product <id> [--model <id>] [--allow-remote]"
    );
  });

  it("refuses a remote URL without --allow-remote and creates no client", async () => {
    const createClient = vi.fn();
    const code = await runTry(
      io,
      { ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: REMOTE },
      ["--product", "7"],
      { createClient, tiersFor: () => [] }
    );
    expect(code).toBe(2);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads remote with the publishable key", async () => {
    const { client } = fakeClient();
    const createClient = vi.fn(() => client);
    await runTry(
      io,
      { ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: REMOTE },
      ["--product", "7", "--allow-remote"],
      { createClient, tiersFor: () => [tier("anthropic", "claude-x", GOOD)] }
    );
    expect(createClient).toHaveBeenCalledWith(REMOTE, PUBLISHABLE);
  });

  it("reads local with the service-role key", async () => {
    const { client } = fakeClient();
    const createClient = vi.fn(() => client);
    await runTry(io, baseEnv, ["--product", "7"], {
      createClient,
      tiersFor: () => [tier("anthropic", "claude-x", GOOD)],
    });
    expect(createClient).toHaveBeenCalledWith(LOCAL, SERVICE);
  });

  it("lists attempts with latency and result, then the texts, and writes nothing", async () => {
    const { client, writes } = fakeClient();
    const code = await runTry(io, baseEnv, ["--product", "7"], {
      createClient: () => client,
      tiersFor: () => [
        tier("free", "free/one:free", new Error("secret provider text")),
        tier("free", "free/two:free", { description: "x" }),
        tier("anthropic", "claude-x", GOOD),
      ],
    });
    const out = logs.join("\n");
    expect(code).toBe(0);
    expect(out).toMatch(/free\/one:free\s+\d+ ms\s+error/);
    expect(out).toMatch(/free\/two:free\s+\d+ ms\s+shape/);
    expect(out).toMatch(/claude-x\s+\d+ ms\s+ok/);
    expect(out).toContain(GOOD.description);
    expect(out).toContain(GOOD.seoTitle);
    expect(out).toContain(GOOD.seoDescription);
    expect(out + errors.join("\n")).not.toContain("secret provider text");
    expect(writes).not.toHaveBeenCalled();
  });

  it("exits 1 when no attempt passes", async () => {
    const { client } = fakeClient();
    const code = await runTry(io, baseEnv, ["--product", "7"], {
      createClient: () => client,
      tiersFor: () => [tier("anthropic", "claude-x", new Error("boom"))],
    });
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/claude-x\s+\d+ ms\s+error/);
  });

  it("restricts the chain to a claude model (R2)", async () => {
    const { client } = fakeClient();
    const seen: AiSettings[] = [];
    await runTry(
      io,
      {
        ...baseEnv,
        ANTHROPIC_API_KEY: "a",
        OPENROUTER_API_KEY: "o",
        AI_FREE_MODELS: "a/b:free",
      },
      ["--product", "7", "--model", "claude-opus-9"],
      {
        createClient: () => client,
        tiersFor: (s) => {
          seen.push(s);
          return [];
        },
      }
    );
    expect(seen[0]).toMatchObject({
      fallbackModel: "claude-opus-9",
      freeModels: [],
      anthropicKey: "a",
    });
  });

  it("restricts the chain to one free model without an Anthropic key (R2)", async () => {
    const { client } = fakeClient();
    const seen: AiSettings[] = [];
    await runTry(
      io,
      { ...baseEnv, ANTHROPIC_API_KEY: "a", OPENROUTER_API_KEY: "o" },
      ["--product", "7", "--model", "vendor/m:free"],
      {
        createClient: () => client,
        tiersFor: (s) => {
          seen.push(s);
          return [];
        },
      }
    );
    expect(seen[0]).toMatchObject({
      freeModels: ["vendor/m:free"],
      anthropicKey: null,
      openRouterKey: "o",
    });
  });

  it("refuses a free model for an unpublished product", async () => {
    const { client } = fakeClient("draft");
    const code = await runTry(
      io,
      { ...baseEnv, OPENROUTER_API_KEY: "o" },
      ["--product", "7", "--model", "vendor/m:free"],
      { createClient: () => client, tiersFor: () => [] }
    );
    expect(code).not.toBe(0);
    expect(errors.join("\n")).toMatch(/only used for published/);
  });

  it("fails when no tier is configured", async () => {
    const { client } = fakeClient();
    const code = await runTry(io, baseEnv, ["--product", "7"], {
      createClient: () => client,
    });
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch(/no model configured/i);
  });
});

import { describe, expect, it, vi } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { tiersFor } from "./providers.ts";
import { checkCopy } from "./product-copy/checks.ts";
import { copySchema } from "./product-copy/schema.ts";
import type { CopyInput } from "./product-copy/input.ts";
import type { AiSettings } from "./settings.ts";

const settings: AiSettings = {
  openRouterKey: "or-key",
  freeModels: ["free/a:free", "free/b:free", "free/c:free"],
  anthropicKey: "an-key",
  fallbackModel: "claude-haiku-5-5",
  monthlyCap: 200,
  hourlyLimit: 20,
  fake: false,
};

const input: CopyInput = {
  kategorie: "Dachhauben",
  produkt: "Dachhaube Classic",
  untertitel: "Robust und leicht",
  material: null,
  materialhinweis: null,
  anzahlArtikel: 0,
  anzahlFarben: 0,
  artikel: [],
  farben: [],
  bisherigeBeschreibung: null,
};

async function fakeAnswer(forInput: CopyInput) {
  vi.useFakeTimers();
  try {
    const [fake] = tiersFor({ ...settings, fake: true });
    const pending = fake!.call(forInput, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

describe("tiersFor (FR-4, FR-9)", () => {
  it("returns two free tiers, then Anthropic, with the timeouts of D4", () => {
    const tiers = tiersFor(settings);
    expect(
      tiers.map(({ kind, model, timeoutMs }) => ({ kind, model, timeoutMs }))
    ).toEqual([
      { kind: "free", model: "free/a:free", timeoutMs: 25_000 },
      { kind: "free", model: "free/b:free", timeoutMs: 25_000 },
      { kind: "anthropic", model: "claude-haiku-5-5", timeoutMs: 30_000 },
    ]);
  });

  it("leaves out the free tiers without key or models", () => {
    expect(
      tiersFor({ ...settings, openRouterKey: null }).map((t) => t.kind)
    ).toEqual(["anthropic"]);
    expect(
      tiersFor({ ...settings, freeModels: [] }).map((t) => t.kind)
    ).toEqual(["anthropic"]);
  });

  it("leaves out Anthropic without key", () => {
    expect(
      tiersFor({ ...settings, anthropicKey: null }).map((t) => t.kind)
    ).toEqual(["free", "free"]);
  });

  it("returns nothing when no tier is configured", () => {
    expect(
      tiersFor({ ...settings, openRouterKey: null, anthropicKey: null })
    ).toEqual([]);
  });

  it("returns only the fake tier when fake is set", () => {
    const tiers = tiersFor({ ...settings, fake: true });
    expect(tiers.map((t) => [t.kind, t.model])).toEqual([["fake", "fake"]]);
  });

  it("uses the configured fallback model", () => {
    const tiers = tiersFor({ ...settings, fallbackModel: "claude-x" });
    expect(tiers.at(-1)?.model).toBe("claude-x");
  });
});

describe("fake tier (D9)", () => {
  it("answers with a draft that passes the checks with an empty number set", async () => {
    const answer = await fakeAnswer(input);
    expect(answer.model).toBe("fake");
    expect(checkCopy(answer.raw, new Set())).toMatchObject({ ok: true });
    expect(JSON.stringify(answer.raw)).toContain("Dachhaube Classic");
    expect(JSON.stringify(answer.raw)).toContain("Robust und leicht");
  });

  it("still passes with a long product name and no subtitle", async () => {
    const long = {
      ...input,
      produkt: "Sehr lang ".repeat(30),
      untertitel: null,
    };
    const answer = await fakeAnswer(long);
    expect(checkCopy(answer.raw, new Set())).toMatchObject({ ok: true });
  });

  it("still passes with a subtitle that ends in punctuation", async () => {
    const answer = await fakeAnswer({
      ...input,
      untertitel: "Robust und leicht.",
    });
    expect(checkCopy(answer.raw, new Set())).toMatchObject({ ok: true });
  });
});

describe("Anthropic output format", () => {
  it("builds from the copy schema (Zod 4 trim and normalize)", () => {
    expect(() => zodOutputFormat(copySchema)).not.toThrow();
  });
});

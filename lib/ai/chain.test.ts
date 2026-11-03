import { describe, expect, it } from "vitest";
import { runChain, type Tier, type TierAnswer } from "./chain.ts";
import type { CopyInput } from "./product-copy/input.ts";

const input: CopyInput = {
  kategorie: "Dachhauben",
  produkt: "Dachhaube Classic",
  untertitel: null,
  material: null,
  materialhinweis: null,
  anzahlArtikel: 0,
  anzahlFarben: 0,
  artikel: [],
  farben: [],
  bisherigeBeschreibung: null,
};

const sentence = "Das Formteil wird aus Polypropylen gespritzt.";
const good = {
  description: sentence.repeat(2),
  seoTitle: "Formteil aus Polypropylen für Reisemobile",
  seoDescription: "Formteil aus Polypropylen für Wohnwagen und Reisemobile.",
};

function answer(raw: unknown, model: string): TierAnswer {
  return { raw, model, inputTokens: 10, outputTokens: 20 };
}

function tier(
  kind: Tier["kind"],
  model: string,
  call: Tier["call"],
  timeoutMs = 1000
): Tier {
  return { kind, model, timeoutMs, call };
}

function working(kind: Tier["kind"], model: string, raw: unknown = good) {
  const calls: string[] = [];
  const t = tier(kind, model, async () => {
    calls.push(model);
    return answer(raw, model);
  });
  return { t, calls };
}

const hang = () => new Promise<TierAnswer>(() => {});

describe("runChain (FR-4, SC-4)", () => {
  it("stops at the first valid free output", async () => {
    const first = working("free", "free/a");
    const second = working("free", "free/b");
    const result = await runChain(input, true, [first.t, second.t]);
    expect(result).toEqual({
      ok: true,
      value: {
        draft: good,
        model: "free/a",
        inputTokens: 10,
        outputTokens: 20,
      },
    });
    expect(second.calls).toEqual([]);
  });

  it("moves on after an error (429-like throw)", async () => {
    const failing = tier("free", "free/a", async () => {
      throw new Error("429 rate limited");
    });
    const next = working("free", "free/b");
    const result = await runChain(input, true, [failing, next.t]);
    expect(result.ok && result.value.model).toBe("free/b");
  });

  it("moves on after a timeout, even if the tier ignores the signal", async () => {
    const hanging = tier("free", "free/a", hang, 20);
    const next = working("anthropic", "claude-x");
    const result = await runChain(input, true, [hanging, next.t]);
    expect(result.ok && result.value.model).toBe("claude-x");
  });

  it("records a timeout as the reason", async () => {
    const result = await runChain(input, true, [
      tier("free", "free/a", hang, 20),
    ]);
    expect(result).toEqual({
      ok: false,
      error: { attempts: [{ model: "free/a", reason: "timeout" }] },
    });
  });

  it("passes a signal that aborts at the timeout, and records a timeout", async () => {
    let aborted = false;
    const t = tier(
      "free",
      "free/a",
      (_input, signal) =>
        new Promise<TierAnswer>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
      20
    );
    const result = await runChain(input, true, [t]);
    expect(aborted).toBe(true);
    expect(result).toEqual({
      ok: false,
      error: { attempts: [{ model: "free/a", reason: "timeout" }] },
    });
  });

  it("treats an empty answer as an error and moves on", async () => {
    const empty = working("free", "free/a", null);
    const next = working("free", "free/b");
    const result = await runChain(input, true, [empty.t, next.t]);
    expect(result.ok && result.value.model).toBe("free/b");

    const only = await runChain(input, true, [empty.t]);
    expect(only).toEqual({
      ok: false,
      error: { attempts: [{ model: "free/a", reason: "error" }] },
    });
  });

  it("moves on after a D3 failure and records the CheckFailure", async () => {
    const tooShort = working("free", "free/a", {
      ...good,
      description: "Kurz.",
    });
    const next = working("anthropic", "claude-x");
    const result = await runChain(input, true, [tooShort.t, next.t]);
    expect(result.ok && result.value.model).toBe("claude-x");

    const allBad = await runChain(input, true, [tooShort.t]);
    expect(allBad).toEqual({
      ok: false,
      error: { attempts: [{ model: "free/a", reason: "length" }] },
    });
  });

  it("applies the D3 checks to the Anthropic and fake tiers too", async () => {
    for (const kind of ["anthropic", "fake"] as const) {
      const bad = working(kind, "m", {
        ...good,
        seoTitle: "Titel mit 99 Teilen",
      });
      const result = await runChain(input, false, [bad.t]);
      expect(result).toEqual({
        ok: false,
        error: { attempts: [{ model: "m", reason: "numbers" }] },
      });
    }
  });

  it("skips free tiers for drafts and archived products", async () => {
    const free = working("free", "free/a");
    const paid = working("anthropic", "claude-x");
    const result = await runChain(input, false, [free.t, paid.t]);
    expect(result.ok && result.value.model).toBe("claude-x");
    expect(free.calls).toEqual([]);
  });

  it("never tries more than two free tiers", async () => {
    const down = (model: string) =>
      tier("free", model, async () => {
        throw new Error("down");
      });
    const third = working("free", "free/c");
    const result = await runChain(input, true, [
      down("free/a"),
      down("free/b"),
      third.t,
    ]);
    expect(third.calls).toEqual([]);
    expect(result).toEqual({
      ok: false,
      error: {
        attempts: [
          { model: "free/a", reason: "error" },
          { model: "free/b", reason: "error" },
        ],
      },
    });
  });

  it("returns every attempt when all tiers fail, without provider texts", async () => {
    const boom = tier("free", "free/a", async () => {
      throw new Error("secret-key-123 leaked in provider text");
    });
    const fenced = working(
      "free",
      "free/b",
      "```json\n" + JSON.stringify(good) + "\n```"
    );
    const paid = tier("anthropic", "claude-x", async () => {
      throw new Error("500");
    });
    const result = await runChain(input, true, [boom, fenced.t, paid]);
    expect(result).toEqual({
      ok: false,
      error: {
        attempts: [
          { model: "free/a", reason: "error" },
          { model: "free/b", reason: "shape" },
          { model: "claude-x", reason: "error" },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("fails a wrongly shaped object as shape without throwing", async () => {
    const extra = working("free", "free/a", { ...good, description: 5 });
    const result = await runChain(input, true, [extra.t]);
    expect(result).toEqual({
      ok: false,
      error: { attempts: [{ model: "free/a", reason: "shape" }] },
    });
  });

  it("returns no attempts when no tier is usable", async () => {
    const free = working("free", "free/a");
    const result = await runChain(input, false, [free.t]);
    expect(result).toEqual({ ok: false, error: { attempts: [] } });
  });

  it("keeps null token counts", async () => {
    const t = tier("anthropic", "claude-x", async () => ({
      raw: good,
      model: "claude-x",
      inputTokens: null,
      outputTokens: null,
    }));
    const result = await runChain(input, false, [t]);
    expect(result.ok && result.value).toMatchObject({
      inputTokens: null,
      outputTokens: null,
    });
  });
});

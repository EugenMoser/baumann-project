import { beforeEach, describe, expect, it, vi } from "vitest";

// Provider SDKs are mocked: these tests pin the request shapes, they never
// reach a real provider.
const { generateText, parse, constructed } = vi.hoisted(() => ({
  generateText: vi.fn(),
  parse: vi.fn(),
  constructed: [] as unknown[],
}));

vi.mock("ai", async (importActual) => ({
  ...(await importActual<typeof import("ai")>()),
  generateText,
}));

vi.mock("@anthropic-ai/sdk", async (importActual) => {
  const actual = await importActual<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    static APIConnectionTimeoutError = actual.default.APIConnectionTimeoutError;
    static APIError = actual.default.APIError;
    messages = { parse };
    constructor(options: unknown) {
      constructed.push(options);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { TierTimeoutError } from "./chain.ts";
import type { CopyInput } from "./product-copy/input.ts";
import { SYSTEM_PROMPT, userMessage } from "./product-copy/prompt.ts";
import { tiersFor } from "./providers.ts";
import type { AiSettings } from "./settings.ts";

const settings: AiSettings = {
  openRouterKey: "or-key",
  freeModels: ["free/a:free"],
  anthropicKey: "an-key",
  fallbackModel: "claude-haiku-5-5",
  monthlyCap: 200,
  hourlyLimit: 20,
  fake: false,
};

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

const draft = {
  description: "Beschreibung.",
  seoTitle: "Titel",
  seoDescription: "Kurz.",
};

function tierOf(kind: "free" | "anthropic") {
  const tier = tiersFor(settings).find((t) => t.kind === kind);
  if (!tier) throw new Error(`no ${kind} tier`);
  return tier;
}

beforeEach(() => {
  generateText.mockReset();
  parse.mockReset();
  constructed.length = 0;
});

describe("free tier call", () => {
  it("requests structured output without retries and maps the result", async () => {
    generateText.mockResolvedValue({
      output: draft,
      usage: { inputTokens: undefined, outputTokens: 42 },
    });
    const signal = new AbortController().signal;

    const answer = await tierOf("free").call(input, signal);

    expect(generateText).toHaveBeenCalledOnce();
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      system: SYSTEM_PROMPT,
      prompt: userMessage(input),
      maxRetries: 0,
      abortSignal: signal,
      output: expect.anything(),
    });
    expect(answer).toEqual({
      raw: draft,
      model: "free/a:free",
      inputTokens: null,
      outputTokens: 42,
    });
  });

  it("propagates an SDK error", async () => {
    const failure = new Error("429");
    generateText.mockRejectedValue(failure);
    await expect(
      tierOf("free").call(input, new AbortController().signal)
    ).rejects.toBe(failure);
  });
});

describe("Anthropic tier call", () => {
  const response = {
    parsed_output: draft,
    usage: { input_tokens: 120, output_tokens: 80 },
  };

  it("builds the client with one retry and the 30 s timeout", async () => {
    parse.mockResolvedValue(response);
    await tierOf("anthropic").call(input, new AbortController().signal);
    expect(constructed).toEqual([
      { apiKey: "an-key", maxRetries: 1, timeout: 30_000 },
    ]);
  });

  it("sends the fixed request shape and maps the response", async () => {
    parse.mockResolvedValue(response);
    const signal = new AbortController().signal;

    const answer = await tierOf("anthropic").call(input, signal);

    const [params, options] = parse.mock.calls[0] as [
      Record<string, unknown> & {
        output_config: { effort: string; format: unknown };
      },
      unknown,
    ];
    expect(params).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage(input) }],
    });
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format).toBeDefined();
    for (const key of ["temperature", "top_p", "top_k", "thinking"])
      expect(params).not.toHaveProperty(key);
    expect(options).toEqual({ signal });
    expect(answer).toEqual({
      raw: draft,
      model: "claude-haiku-5-5",
      inputTokens: 120,
      outputTokens: 80,
    });
  });

  it("rejects when the response has no parsed output", async () => {
    parse.mockResolvedValue({ ...response, parsed_output: null });
    await expect(
      tierOf("anthropic").call(input, new AbortController().signal)
    ).rejects.toThrow();
  });

  it("maps the SDK timeout to a TierTimeoutError", async () => {
    parse.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    await expect(
      tierOf("anthropic").call(input, new AbortController().signal)
    ).rejects.toBeInstanceOf(TierTimeoutError);
  });

  it("rethrows other API errors unchanged", async () => {
    const rateLimited = new Anthropic.APIError(
      429,
      undefined,
      "rate limited",
      undefined
    );
    parse.mockRejectedValue(rateLimited);
    await expect(
      tierOf("anthropic").call(input, new AbortController().signal)
    ).rejects.toBe(rateLimited);
  });
});

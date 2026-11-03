import { describe, expect, it } from "vitest";
import { availability, parseAiSettings, type AiSettings } from "./settings.ts";

const base: AiSettings = {
  openRouterKey: null,
  freeModels: [],
  anthropicKey: null,
  fallbackModel: "claude-haiku-5-5",
  monthlyCap: 200,
  hourlyLimit: 20,
  fake: false,
};

describe("parseAiSettings (FR-9, SC-9)", () => {
  it("applies the defaults for an empty environment", () => {
    expect(parseAiSettings({})).toEqual(base);
  });

  it("treats empty strings like unset variables", () => {
    expect(
      parseAiSettings({
        OPENROUTER_API_KEY: "",
        AI_FREE_MODELS: "",
        ANTHROPIC_API_KEY: "",
        AI_FALLBACK_MODEL: "",
        AI_MONTHLY_REQUEST_CAP: "",
        AI_HOURLY_REQUEST_LIMIT: "",
      })
    ).toEqual(base);
  });

  it("reads all variables", () => {
    expect(
      parseAiSettings({
        OPENROUTER_API_KEY: "or-key",
        AI_FREE_MODELS: "a:free,b:free",
        ANTHROPIC_API_KEY: "an-key",
        AI_FALLBACK_MODEL: "claude-sonnet-5-5",
        AI_MONTHLY_REQUEST_CAP: "50",
        AI_HOURLY_REQUEST_LIMIT: "0",
      })
    ).toEqual({
      openRouterKey: "or-key",
      freeModels: ["a:free", "b:free"],
      anthropicKey: "an-key",
      fallbackModel: "claude-sonnet-5-5",
      monthlyCap: 50,
      hourlyLimit: 0,
      fake: false,
    });
  });

  it("trims the free model list, drops empty entries and keeps the order", () => {
    expect(
      parseAiSettings({ AI_FREE_MODELS: " a:free , ,b:free" }).freeModels
    ).toEqual(["a:free", "b:free"]);
  });

  it.each(["1.5", "-1", "abc", "1e3", "20x"])(
    "rejects the cap value %s",
    (value) => {
      expect(() => parseAiSettings({ AI_MONTHLY_REQUEST_CAP: value })).toThrow(
        /^Invalid environment variables:\n- AI_MONTHLY_REQUEST_CAP: /
      );
      expect(() => parseAiSettings({ AI_HOURLY_REQUEST_LIMIT: value })).toThrow(
        /^Invalid environment variables:\n- AI_HOURLY_REQUEST_LIMIT: /
      );
    }
  );

  it("enables the fake model only for AI_FAKE_MODEL=1", () => {
    expect(parseAiSettings({ AI_FAKE_MODEL: "0" }).fake).toBe(false);
    expect(parseAiSettings({}).fake).toBe(false);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "accepts the fake model with the site URL %s",
    (url) => {
      expect(
        parseAiSettings({ AI_FAKE_MODEL: "1", NEXT_PUBLIC_SITE_URL: url }).fake
      ).toBe(true);
    }
  );

  it.each([
    "https://baumann.example",
    "https://localhost.evil.example",
    "not a url",
    undefined,
  ])("rejects the fake model with the site URL %s", (url) => {
    expect(() =>
      parseAiSettings({ AI_FAKE_MODEL: "1", NEXT_PUBLIC_SITE_URL: url })
    ).toThrow(/^Invalid environment variables:\n- AI_FAKE_MODEL: /);
  });

  it("ignores the site URL while the fake model is off", () => {
    expect(
      parseAiSettings({ NEXT_PUBLIC_SITE_URL: "https://baumann.example" }).fake
    ).toBe(false);
  });
});

describe("availability (FR-9, SC-9)", () => {
  it("is none without keys or models", () => {
    expect(availability(base)).toBe("none");
  });

  it("is none with an OpenRouter key but no free models", () => {
    expect(availability({ ...base, openRouterKey: "k" })).toBe("none");
  });

  it("is none with free models but no OpenRouter key", () => {
    expect(availability({ ...base, freeModels: ["a:free"] })).toBe("none");
  });

  it("is free_only with OpenRouter key and free models", () => {
    expect(
      availability({ ...base, openRouterKey: "k", freeModels: ["a:free"] })
    ).toBe("free_only");
  });

  it("is full with an Anthropic key", () => {
    expect(availability({ ...base, anthropicKey: "k" })).toBe("full");
    expect(
      availability({
        ...base,
        openRouterKey: "k",
        freeModels: ["a:free"],
        anthropicKey: "k",
      })
    ).toBe("full");
  });

  it("is full with the fake model", () => {
    expect(availability({ ...base, fake: true })).toBe("full");
  });
});

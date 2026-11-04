import "server-only";
import { parseAiSettings, type AiSettings } from "../ai/settings.ts";
import { parseServerEnv, type ServerEnv } from "./schema";

export const serverEnv: ServerEnv = parseServerEnv({
  SOURCE_COMMIT: process.env.SOURCE_COMMIT,
});

export const aiSettings: AiSettings = parseAiSettings({
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  AI_FREE_MODELS: process.env.AI_FREE_MODELS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL,
  AI_MONTHLY_REQUEST_CAP: process.env.AI_MONTHLY_REQUEST_CAP,
  AI_HOURLY_REQUEST_LIMIT: process.env.AI_HOURLY_REQUEST_LIMIT,
  AI_FAKE_MODEL: process.env.AI_FAKE_MODEL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

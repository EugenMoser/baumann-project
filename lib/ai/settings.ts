import { z } from "zod";

// No `@/` alias, no `server-only`, no `lib/env` import: scripts/ai/try.mts
// imports this file under Node's type stripping.

export type AiSettings = {
  openRouterKey: string | null;
  freeModels: string[];
  anthropicKey: string | null;
  fallbackModel: string;
  monthlyCap: number;
  hourlyLimit: number;
  fake: boolean;
};

// Empty strings count as unset (Coolify and .env files leave blank variables).
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const limit = (fallback: number) =>
  optionalText.pipe(
    z
      .string()
      .regex(/^\d+$/, "must be a non-negative integer")
      .transform(Number)
      .pipe(z.number().int().safe())
      .optional()
      .transform((value) => value ?? fallback)
  );

function isLocalSiteUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const aiSettingsSchema = z
  .object({
    OPENROUTER_API_KEY: optionalText,
    AI_FREE_MODELS: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "")
      ),
    ANTHROPIC_API_KEY: optionalText,
    AI_FALLBACK_MODEL: optionalText.transform(
      (value) => value ?? "claude-haiku-5-5"
    ),
    AI_MONTHLY_REQUEST_CAP: limit(200),
    AI_HOURLY_REQUEST_LIMIT: limit(20),
    AI_FAKE_MODEL: z.string().optional(),
    // Only read for the fake-model guard.
    NEXT_PUBLIC_SITE_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // The fake model must never run on the preview or in production.
    if (
      env.AI_FAKE_MODEL === "1" &&
      !isLocalSiteUrl(env.NEXT_PUBLIC_SITE_URL)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_FAKE_MODEL"],
        message:
          "only allowed when NEXT_PUBLIC_SITE_URL points to localhost or 127.0.0.1",
      });
    }
  })
  .transform((env): AiSettings => ({
    openRouterKey: env.OPENROUTER_API_KEY ?? null,
    freeModels: env.AI_FREE_MODELS,
    anthropicKey: env.ANTHROPIC_API_KEY ?? null,
    fallbackModel: env.AI_FALLBACK_MODEL,
    monthlyCap: env.AI_MONTHLY_REQUEST_CAP,
    hourlyLimit: env.AI_HOURLY_REQUEST_LIMIT,
    fake: env.AI_FAKE_MODEL === "1",
  }));

export function parseAiSettings(
  source: Record<string, string | undefined>
): AiSettings {
  const result = aiSettingsSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

export type AiAvailability = "none" | "free_only" | "full";

export function availability(s: AiSettings): AiAvailability {
  if (s.fake || s.anthropicKey) return "full";
  if (s.openRouterKey && s.freeModels.length > 0) return "free_only";
  return "none";
}

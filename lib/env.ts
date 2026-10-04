import { z } from "zod";

// Server-only variables are added here in later features (Supabase: feature 2,
// AI: feature 7). Public variables must be read explicitly below so Next.js can
// inline them; never pass `process.env` as a whole.
const serverSchema = z.object({});

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
});

const envSchema = serverSchema.extend(publicSchema.shape);

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

export const env: Env = parseEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

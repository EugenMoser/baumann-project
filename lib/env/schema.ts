import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

// Reads the `role` claim of a JWT without verifying it. Only used to make sure
// a legacy key in a public variable is the low-privilege anon key.
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[\w-]+$/.test(parts[1])) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (typeof payload !== "object" || payload === null) return null;
    if (!("role" in payload)) return null;
    const role = payload.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

// New format (`sb_publishable_…`) or a legacy anon JWT (self-hosted Supabase).
// Secret keys must never end up in a NEXT_PUBLIC_ variable.
const publishableKey = z
  .string()
  .refine(
    (key) => /^sb_publishable_[\w-]+$/.test(key) || jwtRole(key) === "anon",
    "must be a publishable key (sb_publishable_…) or a legacy anon JWT"
  );

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
});

export const serverEnvSchema = z.object({
  // Set by Coolify at runtime; empty means unknown.
  SOURCE_COMMIT: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type Source = Record<string, string | undefined>;

function parseWith<S extends z.ZodType>(schema: S, source: Source): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

export const parsePublicEnv = (source: Source): PublicEnv =>
  parseWith(publicEnvSchema, source);

export const parseServerEnv = (source: Source): ServerEnv =>
  parseWith(serverEnvSchema, source);

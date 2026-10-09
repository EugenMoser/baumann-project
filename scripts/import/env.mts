import { z } from "zod";
import { err, ok, type Result } from "./result.mts";

// Reads the `role` claim of a JWT without verifying it (same check as
// lib/env/schema.ts, duplicated because these scripts run on plain Node).
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[\w-]+$/.test(parts[1] ?? "")) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1] ?? "", "base64url").toString("utf8")
    );
    if (typeof payload !== "object" || payload === null || !("role" in payload))
      return null;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const httpUrl = z.url({ protocol: /^https?$/ });
const secretKey = z
  .string()
  .refine(
    (key) => /^sb_secret_[\w-]+$/.test(key) || jwtRole(key) === "service_role",
    "must be a secret key (sb_secret_…) or a legacy service_role JWT"
  );

const removeEnvSchema = z.object({
  IMPORT_SUPABASE_URL: httpUrl,
  IMPORT_SUPABASE_SECRET_KEY: secretKey,
});
const importEnvSchema = removeEnvSchema.extend({
  IMPORT_IMAGE_BASE_URL: httpUrl,
});

export type ImportEnv = z.infer<typeof importEnvSchema>;
export type RemoveEnv = z.infer<typeof removeEnvSchema>;

function parseWith<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>
): Result<z.infer<S>, string> {
  const result = schema.safeParse(source);
  if (result.success) return ok(result.data);
  // Messages name the variable only; values are never echoed.
  const details = result.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  return err(`Invalid environment variables:\n${details}`);
}

export const parseImportEnv = (source: Record<string, string | undefined>) =>
  parseWith(importEnvSchema, source);
export const parseRemoveEnv = (source: Record<string, string | undefined>) =>
  parseWith(removeEnvSchema, source);

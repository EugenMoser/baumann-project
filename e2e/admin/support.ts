import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Signs in once in admin.setup.ts; its session backs every spec that uses
// STORAGE_STATE, so no spec may sign this user out.
export const ADMIN_EMAIL = "e2e-admin@example.test";
export const ADMIN_PASSWORD = "e2e-admin-password-123";
// Used by the login/logout spec: signOut() ends all sessions of a user, so
// logging out ADMIN_EMAIL would invalidate the shared storage state.
export const LOGOUT_ADMIN_EMAIL = "e2e-logout-admin@example.test";
export const LOGOUT_ADMIN_PASSWORD = "e2e-logout-password-123";
export const USER_EMAIL = "e2e-user@example.test";
export const USER_PASSWORD = "e2e-user-password-123";
export const STORAGE_STATE = path.join(__dirname, "..", ".auth", "admin.json");

export function localStack(): { url: string; secret: string } {
  const status: unknown = JSON.parse(
    execSync("pnpm exec supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  );
  if (
    typeof status !== "object" ||
    status === null ||
    !("API_URL" in status) ||
    !("SECRET_KEY" in status) ||
    typeof status.API_URL !== "string" ||
    typeof status.SECRET_KEY !== "string"
  )
    throw new Error("Local Supabase is not running — run `pnpm db:start`.");
  return { url: status.API_URL, secret: status.SECRET_KEY };
}

export function serviceClient() {
  const { url, secret } = localStack();
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Runs the real CLI (SC-3 end to end): password via stdin, keys via env.
export function createAdmin(email: string, password: string): void {
  const { url, secret } = localStack();
  execFileSync("pnpm", ["admin:create", "--email", email], {
    input: password,
    env: {
      ...process.env,
      IMPORT_SUPABASE_URL: url,
      IMPORT_SUPABASE_SECRET_KEY: secret,
    },
    stdio: ["pipe", "ignore", "inherit"],
  });
}

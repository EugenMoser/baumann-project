import type { AdminClient } from "@/lib/supabase/session";

export const LOGIN_PATH = "/admin/login";
export const ADMIN_HOME = "/admin/produkte";

export type AdminCheck =
  | { kind: "admin"; userId: string; email: string | null }
  | { kind: "forbidden"; email: string | null }
  | { kind: "anonymous" };

// Admin = app_metadata.role "admin", the same claim private.is_admin() checks.
// user_metadata is user-editable and never counts.
export function classifyClaims(claims: unknown): AdminCheck {
  if (typeof claims !== "object" || claims === null)
    return { kind: "anonymous" };
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== "string") return { kind: "anonymous" };
  const email = typeof c.email === "string" ? c.email : null;
  const meta = c.app_metadata;
  const role =
    typeof meta === "object" && meta !== null && "role" in meta
      ? (meta as { role: unknown }).role
      : undefined;
  return role === "admin"
    ? { kind: "admin", userId: c.sub, email }
    : { kind: "forbidden", email };
}

export async function checkAdmin(client: AdminClient): Promise<AdminCheck> {
  const { data, error } = await client.auth.getClaims();
  if (error || !data) return { kind: "anonymous" };
  return classifyClaims(data.claims);
}

// Only paths below /admin/ (never the login page itself) — no open redirect.
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.includes("\\")) return ADMIN_HOME;
  let url: URL;
  try {
    url = new URL(raw, "http://admin.invalid");
  } catch {
    return ADMIN_HOME;
  }
  const path = url.pathname;
  if (
    url.origin !== "http://admin.invalid" ||
    raw.startsWith("//") ||
    !path.startsWith("/admin/") ||
    path.startsWith(LOGIN_PATH)
  )
    return ADMIN_HOME;
  return path + url.search;
}

export function loginPathFor(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

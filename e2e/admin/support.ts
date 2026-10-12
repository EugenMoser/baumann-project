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

// Published e2e product with one article, created directly (service role).
export async function createPublishedProduct(
  slug: string,
  name: string,
  articleNumber: string
): Promise<number> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("product")
    .insert({ category_id: 1, slug, name, status: "published" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: articleError } = await svc
    .from("article")
    .insert({ product_id: data.id, article_number: articleNumber });
  if (articleError) throw articleError;
  return data.id;
}

// Removes e2e products with their media rows and files, then e2e master data.
export async function removeE2eData(): Promise<void> {
  const svc = serviceClient();
  const { data: products, error } = await svc
    .from("product")
    .select("id, product_media(media(id, storage_path))")
    .like("slug", "e2e-%");
  if (error) throw error;
  const media = products.flatMap((p) =>
    p.product_media.flatMap((pm) => pm.media)
  );
  if (media.length > 0) {
    const { error: rowError } = await svc
      .from("media")
      .delete()
      .in(
        "id",
        media.map((m) => m.id)
      );
    if (rowError) throw rowError;
    const { error: fileError } = await svc.storage
      .from("catalog")
      .remove(media.map((m) => m.storage_path));
    if (fileError) throw fileError;
  }
  for (const [table, column, pattern] of [
    ["product", "slug", "e2e-%"],
    ["category", "slug", "e2e-%"],
    ["color", "name", "E2E %"],
    ["material", "code", "E2E-%"],
  ] as const) {
    const { error: deleteError } = await svc
      .from(table)
      .delete()
      .like(column, pattern);
    if (deleteError) throw deleteError;
  }
}

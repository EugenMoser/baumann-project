import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
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

// Published e2e product with one article and two colours (seed colours 1 and
// 2, suffixes "1" and "2", sort order 0 and 1, the first one the default).
export async function createProductWithTwoColors(
  slug: string,
  name: string,
  articleNumber: string
): Promise<number> {
  const id = await createPublishedProduct(slug, name, articleNumber);
  const { error } = await serviceClient()
    .from("product_color")
    .insert([
      {
        product_id: id,
        color_id: 1,
        suffix: "1",
        sort_order: 0,
        is_default: true,
      },
      {
        product_id: id,
        color_id: 2,
        suffix: "2",
        sort_order: 1,
        is_default: false,
      },
    ]);
  if (error) throw error;
  return id;
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no bounding box.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Where to drop: the pointer ends a bit above or below the target's centre,
// so the dragged row's centre is closest to the target row.
function dropPoint(
  target: { x: number; y: number },
  edge: "above" | "below"
): { x: number; y: number } {
  return { x: target.x, y: target.y + (edge === "below" ? 10 : -10) };
}

// Mouse drag of a sortable row by its handle (needs >= 5 px of movement).
export async function dragHandleWithMouse(
  page: Page,
  handle: Locator,
  target: Locator,
  edge: "above" | "below"
): Promise<void> {
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = await centreOf(handle);
  const to = dropPoint(await centreOf(target), edge);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

// Touch drag via CDP: press and hold (the sensor starts after 200 ms), then
// move in steps. The page needs a context with hasTouch.
export async function dragHandleWithTouch(
  page: Page,
  handle: Locator,
  target: Locator,
  edge: "above" | "below"
): Promise<void> {
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = await centreOf(handle);
  const to = dropPoint(await centreOf(target), edge);
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    point?: { x: number; y: number }
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [point] : [],
    });
  await touch("touchStart", from);
  await page.waitForTimeout(350);
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await cdp.detach();
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

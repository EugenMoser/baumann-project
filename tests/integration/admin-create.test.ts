import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { runAdminCreate } from "../../scripts/admin/create.mts";

const EMAIL = "int-admin-create@example.test";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const service = createClient(
  process.env.IMPORT_SUPABASE_URL ?? "",
  process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

const run = (password: string) =>
  runAdminCreate(["--email", EMAIL], {
    env: process.env,
    log: () => undefined,
    error: () => undefined,
    readPassword: async () => password,
  });

async function signIn(password: string) {
  const client = createClient(url, publishable, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: EMAIL,
    password,
  });
  return { client, error };
}

afterAll(async () => {
  const { data } = await service.auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users.filter((x) => x.email === EMAIL))
    await service.auth.admin.deleteUser(u.id);
});

describe("admin:create against the local stack (SC-3)", () => {
  it("creates an admin whose session passes private.is_admin()", async () => {
    expect(await run("first-password-123")).toBe(0);
    const { client, error } = await signIn("first-password-123");
    expect(error).toBeNull();
    // Drafts are visible only when private.is_admin() is true.
    const { data } = await client
      .from("product")
      .select("id")
      .eq("status", "draft");
    expect(data?.length).toBeGreaterThan(0);
  });

  it("updates the password on a second run without a second user", async () => {
    expect(await run("second-password-456")).toBe(0);
    expect((await signIn("second-password-456")).error).toBeNull();
    expect((await signIn("first-password-123")).error).not.toBeNull();
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    expect(data.users.filter((u) => u.email === EMAIL)).toHaveLength(1);
  });
});

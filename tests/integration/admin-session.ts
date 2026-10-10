import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const service = () =>
  createClient(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

// Signed-in client for a throwaway user; role "admin" or none.
export async function sessionClient(
  email: string,
  admin: boolean
): Promise<SupabaseClient<Database>> {
  const password = "integration-password-123";
  const svc = service();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) await svc.auth.admin.deleteUser(existing.id);
  await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: admin ? { role: "admin" } : {},
  });
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function deleteUser(email: string): Promise<void> {
  const svc = service();
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  for (const u of data.users.filter((x) => x.email === email))
    await svc.auth.admin.deleteUser(u.id);
}

export async function deleteProductsBySlugPrefix(
  prefix: string
): Promise<void> {
  await service().from("product").delete().like("slug", `${prefix}%`);
}

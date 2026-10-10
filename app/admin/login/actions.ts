"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH, safeNext } from "@/lib/admin/auth";
import { LOGIN_FAILED, loginSchema } from "@/lib/admin/login";
import { createSessionSupabase } from "@/lib/supabase/session";

export type LoginState = { error: string | null; email: string };

// One generic message for every failure (spec D3); GoTrue rate-limits attempts.
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = loginSchema.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: LOGIN_FAILED, email };
  const supabase = await createSessionSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: LOGIN_FAILED, email };
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  const supabase = await createSessionSupabase();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

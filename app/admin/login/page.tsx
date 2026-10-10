import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { safeNext } from "@/lib/admin/auth";
import { login } from "./actions";

export const metadata: Metadata = { title: "Admin-Anmeldung" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Admin-Anmeldung</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nur für die Pflege des Katalogs. Es gibt keine Registrierung.
      </p>
      <LoginForm
        action={login}
        next={safeNext(Array.isArray(next) ? next[0] : next)}
      />
    </main>
  );
}

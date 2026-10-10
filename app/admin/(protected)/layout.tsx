import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { Forbidden } from "@/components/admin/forbidden";
import { Toaster } from "@/components/ui/sonner";
import { branding } from "@/config/branding";
import { checkAdmin, LOGIN_PATH } from "@/lib/admin/auth";
import { createSessionSupabase } from "@/lib/supabase/session";
import { logout } from "../login/actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s – Admin" },
};

// Second layer (spec D2): every protected page checks the claims itself.
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await checkAdmin(await createSessionSupabase());
  if (auth.kind === "anonymous") redirect(LOGIN_PATH);
  return (
    <>
      <AdminHeader
        email={auth.email}
        shortName={branding.shortName}
        logoutAction={logout}
      />
      {auth.kind === "forbidden" ? (
        <Forbidden />
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
      )}
      <Toaster />
    </>
  );
}

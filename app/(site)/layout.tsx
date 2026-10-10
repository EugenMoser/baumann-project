import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { branding } from "@/config/branding";

// Public chrome; the admin (feature 6a) has its own shell.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader branding={branding} />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter branding={branding} />
    </>
  );
}

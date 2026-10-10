import { NotFoundContent } from "@/components/site/not-found-content";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { branding } from "@/config/branding";

// Unmatched URLs render outside the (site) group, so the chrome is added here.
export default function NotFound() {
  return (
    <>
      <SiteHeader branding={branding} />
      <NotFoundContent />
      <SiteFooter branding={branding} />
    </>
  );
}

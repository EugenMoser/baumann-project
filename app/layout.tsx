import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { branding } from "@/config/branding";
import { publicEnv } from "@/lib/env/public";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${branding.companyName} – Vorschau`,
    template: `%s – ${branding.shortName} (Vorschau)`,
  },
  description: `${branding.previewLabel}: Produktkatalog von ${branding.companyName}.`,
  // The preview must never be indexed (see also next.config.ts and app/robots.ts).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <DemoBanner branding={branding} />
        <SiteHeader branding={branding} />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter branding={branding} />
      </body>
    </html>
  );
}

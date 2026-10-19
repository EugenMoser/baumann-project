import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { branding } from "@/config/branding";
import { publicEnv } from "@/lib/env/public";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${instrumentSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <DemoBanner branding={branding} />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}

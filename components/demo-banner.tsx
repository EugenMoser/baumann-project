import type { Branding } from "@/config/branding";

type DemoBannerProps = {
  branding: Branding;
};

// Always visible and not dismissible: the preview uses real customer data and
// must never be mistaken for the official website.
export function DemoBanner({ branding }: DemoBannerProps) {
  return (
    <section
      aria-label="Hinweis zur Vorschau"
      className="w-full bg-amber-300 text-sm text-amber-950"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <p className="min-w-0">
          <span className="font-semibold">Vorschau</span>
          <span className="hidden sm:inline">
            {" "}
            · {branding.previewLabel} – nicht die offizielle Website von{" "}
            {branding.companyName}
            {branding.companyName.endsWith(".") ? "" : "."}
          </span>
          <span className="sm:hidden"> – nicht die offizielle Website</span>
        </p>
        <nav aria-label="Links zur Vorschau" className="flex flex-wrap gap-x-4">
          <a
            href={branding.officialSiteUrl}
            className="underline underline-offset-2"
          >
            Zur offiziellen Seite
          </a>
          <a
            href={branding.developer.url}
            className="underline underline-offset-2"
          >
            Umsetzung: {branding.developer.name}
          </a>
        </nav>
      </div>
    </section>
  );
}

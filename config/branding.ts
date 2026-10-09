import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

export const brandingSchema = z.object({
  companyName: z.string().min(1),
  shortName: z.string().min(1),
  officialSiteUrl: httpUrl,
  previewLabel: z.string().min(1),
  developer: z.object({
    name: z.string().min(1),
    url: httpUrl,
  }),
});

export type Branding = z.infer<typeof brandingSchema>;

// Customer and developer names/links. On revocation the `branding` export at
// the bottom is switched to `placeholderBranding` (docs/revocation.md).
const customerBranding: Branding = brandingSchema.parse({
  companyName: "Tilo Baumann Spritzgussteile e.K.",
  shortName: "Baumann",
  officialSiteUrl: "https://www.baumann-entwicklungen.de",
  previewLabel: "Kundenprojekt in Entwicklung (Vorschau)",
  developer: { name: "Eugen Moser", url: "https://eugen-moser.com" },
});

// Contains no customer data.
export const placeholderBranding: Branding = brandingSchema.parse({
  companyName: "Beispiel Kunststoffteile GmbH",
  shortName: "Beispiel",
  officialSiteUrl: "https://example.com",
  previewLabel: "Referenzprojekt (Vorschau mit Beispieldaten)",
  developer: { name: "Eugen Moser", url: "https://eugen-moser.com" },
});

// Single source used by the app. Revocation switch (one line):
export const branding: Branding = customerBranding; // revocation: placeholderBranding

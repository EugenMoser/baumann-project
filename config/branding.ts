import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

export const brandingSchema = z.object({
  companyName: z.string().min(1),
  shortName: z.string().min(1),
  officialSiteUrl: httpUrl,
  previewLabel: z.string().min(1),
  // Quality and environmental policy, one string per paragraph (spec D2).
  qualityPolicy: z.array(z.string().min(1)).min(1),
  developer: z.object({
    name: z.string().min(1),
    url: httpUrl,
    // The developer operates the preview, so their legal pages apply (spec D1).
    imprintUrl: httpUrl,
    privacyUrl: httpUrl,
  }),
});

export type Branding = z.infer<typeof brandingSchema>;

// Customer and developer names/links, plus the customer's quality policy text
// (customer content, removed by the same switch). On revocation the `branding`
// export at the bottom is switched to `placeholderBranding`
// (docs/revocation.md).
const customerBranding: Branding = brandingSchema.parse({
  companyName: "Tilo Baumann Spritzgussteile e.K.",
  shortName: "Baumann",
  officialSiteUrl: "https://www.baumann-entwicklungen.de",
  previewLabel: "Kundenprojekt in Entwicklung (Vorschau)",
  qualityPolicy: [
    "Qualität und Umweltschutz sind für uns mehr als Normanforderungen, sie sind Teil unserer täglichen Verantwortung. Mit unserem integrierten Managementsystem nach ISO 9001 und ISO 14001 stellen wir sicher, dass unsere Prozesse zuverlässig, effizient und nachhaltig gestaltet sind.",
    "Wir arbeiten kundenorientiert, erfüllen konsequent alle gesetzlichen Vorgaben und setzen auf vorbeugende Qualitätssicherung statt Fehlerkorrektur. Gleichzeitig gehen wir verantwortungsvoll mit Energie und Rohstoffen um und verbessern unsere Abläufe kontinuierlich.",
    "So schaffen wir Vertrauen, sichern langfristige Partnerschaften und übernehmen Verantwortung für Umwelt und Zukunft.",
  ],
  developer: {
    name: "Eugen Moser",
    url: "https://eugen-moser.com",
    imprintUrl: "https://eugen-moser.com/impressum",
    privacyUrl: "https://eugen-moser.com/datenschutz",
  },
});

// Contains no customer data.
export const placeholderBranding: Branding = brandingSchema.parse({
  companyName: "Beispiel Kunststoffteile GmbH",
  shortName: "Beispiel",
  officialSiteUrl: "https://example.com",
  previewLabel: "Referenzprojekt (Vorschau mit Beispieldaten)",
  qualityPolicy: [
    "Platzhalter: Hier steht die Qualitäts- und Umweltpolitik des Unternehmens.",
  ],
  developer: {
    name: "Eugen Moser",
    url: "https://eugen-moser.com",
    imprintUrl: "https://eugen-moser.com/impressum",
    privacyUrl: "https://eugen-moser.com/datenschutz",
  },
});

// Single source used by the app. Revocation switch (one line):
export const branding: Branding = customerBranding; // revocation: placeholderBranding

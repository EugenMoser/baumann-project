import type { ProductPage } from "./types";

// Synthetic product for unit tests (99xxx numbers, invented names).
export function makeProductPage(
  overrides: Partial<ProductPage> = {}
): ProductPage {
  return {
    slug: "testkeil",
    name: "Testkeil",
    subtitle: "für Beispielschlösser",
    thumbnail: null,
    description: "Erster Absatz.\n\nZweiter Absatz.",
    descriptionOrigin: "human",
    seoTitle: null,
    seoDescription: null,
    seoOrigin: "human",
    category: { slug: "moebel", name: "Möbel" },
    material: { code: "PA-6", name: "Polyamid 6" },
    materialNote: null,
    articles: [
      {
        articleNumber: "99010",
        name: "Testkeil 8 mm",
        description: null,
        note: null,
        material: null,
        materialNote: null,
        attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 8 }],
        packaging: [{ quantity: 100, label: null }],
      },
      {
        articleNumber: "99211/80",
        name: null,
        description: null,
        note: "mit Bohrung",
        material: null,
        materialNote: null,
        attributes: [{ key: "height", label: "Höhe", unit: "mm", value: 10.5 }],
        packaging: [],
      },
    ],
    colors: [
      {
        id: 3,
        name: "braun",
        ralReference: null,
        hexCode: "#6B4423",
        family: "braun",
        suffix: "1",
        isDefault: true,
      },
      {
        id: 1,
        name: "weiß",
        ralReference: "ähnlich RAL 9016",
        hexCode: "#F4F4F4",
        family: "weiß",
        suffix: "2",
        isDefault: false,
      },
    ],
    variants: [
      {
        orderNumber: "99010 - 1",
        articleNumber: "99010",
        suffix: "1",
        isDefault: true,
        colorId: 3,
      },
      {
        orderNumber: "99010 - 2",
        articleNumber: "99010",
        suffix: "2",
        isDefault: false,
        colorId: 1,
      },
      {
        orderNumber: "99211/80 - 1",
        articleNumber: "99211/80",
        suffix: "1",
        isDefault: true,
        colorId: 3,
      },
      {
        orderNumber: "99211/80 - 2",
        articleNumber: "99211/80",
        suffix: "2",
        isDefault: false,
        colorId: 1,
      },
    ],
    media: [],
    accessories: [],
    related: [],
    ...overrides,
  };
}

import type {
  Snapshot,
  SnapshotArticle,
  SnapshotColor,
  SnapshotProduct,
  SnapshotProductColor,
} from "../../scripts/import/snapshot.mts";

export function product(
  overrides: Partial<SnapshotProduct> = {}
): SnapshotProduct {
  return {
    product_id: 9001,
    prio: 10000,
    category: "moebel",
    name: "Testkeil mit Dämpfung",
    description1: "für Testschlösser",
    description2: "Gedämpfter Testkeil.",
    description3: null,
    description4: null,
    material: "PA-6",
    imageUrls_small: ["/a_98010-Testkeil.webp"],
    imageUrls_big: ["/b1_98010-Testkeil.webp"],
    ...overrides,
  };
}

export function article(
  overrides: Partial<SnapshotArticle> = {}
): SnapshotArticle {
  return {
    product_id: 9001,
    number: "98010",
    prio: 10000,
    name: "Testkeil mit Dämpfung",
    description1: "Höhe 8 mm",
    description2: null,
    description3: null,
    description4: null,
    vpe1: "500",
    vpe2: null,
    vpe3: null,
    vpe4: null,
    ...overrides,
  };
}

export function color(overrides: Partial<SnapshotColor> = {}): SnapshotColor {
  return {
    color_id: "1-1",
    name: "testweiß (ähnlich RAL 9016)",
    code: "#F2F5F3",
    ...overrides,
  };
}

export function link(
  overrides: Partial<SnapshotProductColor> = {}
): SnapshotProductColor {
  return { product_id: 9001, color_id: "1-1", color_suffix: 0, ...overrides };
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    products: [product()],
    articles: [article()],
    colors: [color()],
    product_colors_connection: [link()],
    unknownFields: [],
    ...overrides,
  };
}

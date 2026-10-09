// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Finding } from "../../scripts/import/findings.mts";
import { renderReport } from "../../scripts/import/report.mts";

const all: Finding[] = [
  {
    kind: "failed_image",
    url: "https://cdn.test/a.webp",
    storagePath: "products/m/p/a.webp",
    reason: "HTTP 404",
  },
  { kind: "unparsed_attribute", articleNumber: "98020", text: "Ø 12 mm" },
  {
    kind: "partial_attribute",
    articleNumber: "98011/80",
    text: "Höhe 9,5 mm abgesetzt",
    remainder: "abgesetzt",
  },
  {
    kind: "material_fallback",
    legacyProductId: 9002,
    text: "A: PA-6 / B: ABS",
  },
  { kind: "default_color_by_rule", legacyProductId: 9002, suffix: "1" },
  {
    kind: "merged_color",
    name: "testgrau",
    hex: "#8A8D8F",
    legacyColorIds: ["4-1", "4-2"],
  },
  {
    kind: "shared_article",
    articleNumber: "98010",
    homeLegacyProductId: 9001,
    accessoryLegacyProductIds: [9003],
  },
  {
    kind: "slug_collision",
    legacyProductId: 9004,
    slug: "testtraeger-fuer-16-mm",
    level: "subtitle",
  },
  { kind: "skipped_image", legacyProductId: 9001, reference: "/a_extra.webp" },
  {
    kind: "packaging_note",
    articleNumber: "98020",
    text: "wird passend verpackt",
  },
  { kind: "alt_text_review", storagePath: "products/m/p/a.webp" },
];

const stats = {
  products: 3,
  articles: 4,
  accessories: 1,
  colors: 3,
  materials: 2,
  attributes: 1,
  images: 3,
  fragments: 5,
  typedFragments: 2,
};

describe("renderReport (FR-11, SC-11)", () => {
  it("renders every finding type with its identifiers", () => {
    const md = renderReport({
      generatedAt: new Date("2026-10-09T10:00:00.000Z"),
      mode: "import",
      outcome: "imported",
      stats,
      findings: all,
      result: { products: 3, deleted_products: 0 },
    });
    expect(md).toContain("# Import report");
    expect(md).toContain("- Generated: 2026-10-09T10:00:00.000Z");
    expect(md).toContain("- Mode: import");
    expect(md).toContain("| Typed description fragments | 2 of 5 |");
    expect(md).toContain("| deleted_products | 0 |");
    for (const line of [
      "- `products/m/p/a.webp` ← https://cdn.test/a.webp: HTTP 404",
      "- 98020: `Ø 12 mm`",
      "- 98011/80: `Höhe 9,5 mm abgesetzt` → note `abgesetzt`",
      "- product 9002: `A: PA-6 / B: ABS`",
      "- product 9002: suffix `1`",
      "- `testgrau` #8A8D8F: 4-1, 4-2",
      "- 98010: home product 9001, accessory of 9003",
      "- product 9004: `testtraeger-fuer-16-mm` (name + subtitle)",
      "- product 9001: `/a_extra.webp`",
      "- 98020: `wird passend verpackt`",
      "- `products/m/p/a.webp`",
    ]) {
      expect(md).toContain(line);
    }
    const order = [
      "## Failed image downloads",
      "## Unparsed attribute values",
      "## Partially parsed attribute values",
      "## Material fallbacks",
      "## Default colour set by rule",
      "## Merged colours",
      "## Shared articles",
      "## Slug collisions",
      "## Skipped images",
      "## Packaging notes",
      "## Alt texts to review",
    ].map((heading) => md.indexOf(heading));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("omits empty sections, the summary without stats and the result without counts", () => {
    const md = renderReport({
      generatedAt: new Date("2026-10-09T10:00:00.000Z"),
      mode: "dry-run",
      outcome: "dry run — nothing written",
      stats: null,
      findings: [
        { kind: "unparsed_attribute", articleNumber: "98020", text: "Ø 12 mm" },
      ],
      result: null,
    });
    expect(md).toContain("- Mode: dry run");
    expect(md).toContain("## Unparsed attribute values\n\n1 entries.");
    expect(md).not.toContain("## Summary");
    expect(md).not.toContain("## Database result");
    expect(md).not.toContain("## Merged colours");
  });
});

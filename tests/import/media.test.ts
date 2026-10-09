// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  mapMedia,
  normaliseFileName,
  resolveImageUrl,
} from "../../scripts/import/map/media.mts";
import type { PayloadProduct } from "../../scripts/import/payload.mts";
import { product } from "./factory";

const base = "https://cdn.example.test/img/upload/v1/Folder";
const row: PayloadProduct = {
  legacy_product_id: 9001,
  category_slug: "moebel",
  slug: "testkeil-mit-daempfung",
  name: "Testkeil mit Dämpfung",
  subtitle: null,
  description: null,
  material_code: null,
  material_note: null,
  sort_order: 0,
};

describe("resolveImageUrl (FR-7, SC-7)", () => {
  it("resolves relative references and replaces spaces", () => {
    expect(resolveImageUrl("/a_98020 Testhalter.webp", base)).toBe(
      "https://cdn.example.test/img/upload/v1/Folder/a_98020_Testhalter.webp"
    );
  });
  it("encodes umlauts", () => {
    expect(resolveImageUrl("a_98030-Türpuffer.webp", `${base}/`)).toBe(
      "https://cdn.example.test/img/upload/v1/Folder/a_98030-T%C3%BCrpuffer.webp"
    );
  });
  it("keeps absolute references", () => {
    expect(resolveImageUrl("https://other.example.test/x/a.webp", base)).toBe(
      "https://other.example.test/x/a.webp"
    );
  });
});

describe("normaliseFileName (FR-7, SC-7)", () => {
  it("produces ASCII names without spaces", () => {
    expect(normaliseFileName("/a_98020 Testhalter.webp")).toBe(
      "a-98020-testhalter.webp"
    );
    expect(
      normaliseFileName("https://x.test/b1_98030-T%C3%BCrpuffer.WEBP")
    ).toBe("b1-98030-tuerpuffer.webp");
  });
  it("rejects unsupported or empty names", () => {
    expect(normaliseFileName("/datei.gif")).toBeNull();
    expect(normaliseFileName("/.webp")).toBeNull();
    expect(normaliseFileName("/ohne-endung")).toBeNull();
  });
});

describe("mapMedia (FR-7, SC-7)", () => {
  it("assigns roles, paths and alt texts", () => {
    const result = mapMedia(
      [
        product({
          imageUrls_small: ["/a_98010-Testkeil.webp", "/a_98010-Extra.webp"],
          imageUrls_big: ["/b1_98010-Testkeil.webp", "/b2_98010-Testkeil.webp"],
        }),
      ],
      [row],
      base
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dir = "products/moebel/testkeil-mit-daempfung";
    expect(result.value.product_media).toEqual([
      {
        legacy_product_id: 9001,
        storage_path: `${dir}/a-98010-testkeil.webp`,
        role: "thumbnail",
        sort_order: 0,
      },
      {
        legacy_product_id: 9001,
        storage_path: `${dir}/b1-98010-testkeil.webp`,
        role: "gallery",
        sort_order: 1,
      },
      {
        legacy_product_id: 9001,
        storage_path: `${dir}/b2-98010-testkeil.webp`,
        role: "gallery",
        sort_order: 2,
      },
    ]);
    expect(result.value.media[0]).toEqual({
      storage_path: `${dir}/a-98010-testkeil.webp`,
      alt_text: "Testkeil mit Dämpfung",
      url: `${base}/a_98010-Testkeil.webp`,
      content_type: "image/webp",
      legacy_product_id: 9001,
    });
    expect(result.value.findings).toContainEqual({
      kind: "skipped_image",
      legacyProductId: 9001,
      reference: "/a_98010-Extra.webp",
    });
    expect(
      result.value.findings.filter((f) => f.kind === "alt_text_review")
    ).toHaveLength(3);
  });

  it("skips a repeated image within a product", () => {
    const result = mapMedia(
      [
        product({
          imageUrls_small: ["/a.webp"],
          imageUrls_big: ["/a.webp", " "],
        }),
      ],
      [row],
      base
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.product_media).toHaveLength(1);
    expect(result.value.findings).toContainEqual({
      kind: "skipped_image",
      legacyProductId: 9001,
      reference: "/a.webp",
    });
  });

  it("handles products without images", () => {
    const result = mapMedia(
      [product({ imageUrls_small: [], imageUrls_big: [] })],
      [row],
      base
    );
    expect(result.ok && result.value.media).toEqual([]);
  });

  it("rejects an unsupported reference", () => {
    const result = mapMedia(
      [product({ imageUrls_small: ["/datei.gif"] })],
      [row],
      base
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_data",
        message: 'product 9001: unsupported image reference "/datei.gif"',
      },
    });
  });
});

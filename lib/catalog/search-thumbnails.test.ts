import { describe, expect, it } from "vitest";
import { mergeThumbnails } from "./search";
import type { MediaRole, SearchHit } from "./types";

type ThumbnailRow = {
  slug: string;
  category: { slug: string };
  product_media: {
    role: MediaRole;
    sort_order: number;
    media: {
      storage_path: string;
      width: number;
      height: number;
      alt_text: string;
    };
  }[];
};

const hit = (categorySlug: string, productSlug: string): SearchHit => ({
  categorySlug,
  productSlug,
  name: productSlug,
  subtitle: null,
  matchedNumbers: [],
  matchKind: "text",
});

const row = (
  categorySlug: string,
  slug: string,
  path: string,
  role: MediaRole = "thumbnail"
): ThumbnailRow => ({
  slug,
  category: { slug: categorySlug },
  product_media: [
    {
      role,
      sort_order: 0,
      media: { storage_path: path, width: 200, height: 100, alt_text: path },
    },
  ],
});

describe("mergeThumbnails (D5)", () => {
  it("gives hits with the same product slug in different categories their own thumbnails", () => {
    const result = mergeThumbnails(
      [hit("a", "keil"), hit("b", "keil")],
      [row("a", "keil", "a.webp"), row("b", "keil", "b.webp")]
    );
    expect(result.map((r) => r.thumbnail?.storagePath)).toEqual([
      "a.webp",
      "b.webp",
    ]);
  });

  it("sets thumbnail to null when no row matches the hit", () => {
    const result = mergeThumbnails(
      [hit("a", "keil"), hit("a", "griff")],
      [row("a", "keil", "a.webp")]
    );
    expect(result[1].thumbnail).toBeNull();
    expect(result[0].thumbnail?.storagePath).toBe("a.webp");
  });

  it("sets thumbnail to null for a product without media", () => {
    const empty: ThumbnailRow = { ...row("a", "keil", "x"), product_media: [] };
    expect(
      mergeThumbnails([hit("a", "keil")], [empty])[0].thumbnail
    ).toBeNull();
  });

  it("keeps the order of the hits and their fields", () => {
    const hits = [hit("b", "z"), hit("a", "y"), hit("a", "x")];
    const result = mergeThumbnails(hits, [
      row("a", "x", "x.webp"),
      row("a", "y", "y.webp"),
      row("b", "z", "z.webp"),
    ]);
    expect(result.map((r) => r.productSlug)).toEqual(["z", "y", "x"]);
    expect(result[0]).toMatchObject({ categorySlug: "b", matchKind: "text" });
  });

  it("returns an empty list for no hits", () => {
    expect(mergeThumbnails([], [row("a", "keil", "a.webp")])).toEqual([]);
  });
});

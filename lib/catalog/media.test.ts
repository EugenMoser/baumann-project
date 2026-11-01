import { describe, expect, it } from "vitest";
import {
  galleryRows,
  pickThumbnail,
  pickTileImage,
  publicMediaUrl,
} from "./media";

const row = (
  role: "thumbnail" | "gallery",
  sort_order: number,
  path: string
) => ({
  role,
  sort_order,
  media: { storage_path: path, width: 800, height: 600, alt_text: path },
});

describe("publicMediaUrl (FR-10, SC-10)", () => {
  it("builds the public object URL of the catalog bucket", () => {
    expect(publicMediaUrl("products/a/b.webp", "https://api.example.com")).toBe(
      "https://api.example.com/storage/v1/object/public/catalog/products/a/b.webp"
    );
  });

  it("encodes each path segment but keeps the slashes", () => {
    expect(
      publicMediaUrl("products/ä b/x#1.webp", "https://api.example.com/")
    ).toBe(
      "https://api.example.com/storage/v1/object/public/catalog/products/%C3%A4%20b/x%231.webp"
    );
  });
});

describe("pickThumbnail", () => {
  it("prefers the first thumbnail by sort order", () => {
    expect(
      pickThumbnail([
        row("gallery", 0, "g"),
        row("thumbnail", 2, "t2"),
        row("thumbnail", 1, "t1"),
      ])
    ).toEqual({ storagePath: "t1", width: 800, height: 600, altText: "t1" });
  });

  it("falls back to the first gallery image, then null", () => {
    expect(
      pickThumbnail([row("gallery", 1, "g1"), row("gallery", 0, "g0")])
        ?.storagePath
    ).toBe("g0");
    expect(pickThumbnail([])).toBeNull();
  });
});

describe("galleryRows / pickTileImage (4b SC-1)", () => {
  const mixed = [
    row("thumbnail", 0, "a.webp"),
    row("gallery", 2, "c.webp"),
    row("gallery", 1, "b.webp"),
  ];

  it("returns all gallery rows by sort order", () => {
    expect(galleryRows(mixed).map((r) => r.media.storage_path)).toEqual([
      "b.webp",
      "c.webp",
    ]);
  });

  it("falls back to the first thumbnail alone", () => {
    expect(
      galleryRows([row("thumbnail", 1, "y"), row("thumbnail", 0, "x")]).map(
        (r) => r.media.storage_path
      )
    ).toEqual(["x"]);
  });

  it("returns an empty list without rows", () => {
    expect(galleryRows([])).toEqual([]);
    expect(pickTileImage([])).toBeNull();
  });

  it("picks the first gallery image for the tile", () => {
    expect(pickTileImage(mixed)).toEqual({
      storagePath: "b.webp",
      width: 800,
      height: 600,
      altText: "b.webp",
    });
  });

  it("uses the thumbnail when there is no gallery image", () => {
    expect(pickTileImage([row("thumbnail", 0, "t.webp")])?.storagePath).toBe(
      "t.webp"
    );
  });
});

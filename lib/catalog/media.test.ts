import { describe, expect, it } from "vitest";
import { pickThumbnail, publicMediaUrl } from "./media";

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

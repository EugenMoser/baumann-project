import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductSummary } from "@/lib/catalog/types";
import { ProductTile } from "./product-tile";

const product: ProductSummary = {
  slug: "testkeil",
  name: "Testkeil",
  subtitle: null,
  thumbnail: {
    storagePath: "t.webp",
    width: 80,
    height: 80,
    altText: "Vorschau",
  },
  tileImage: {
    storagePath: "g.webp",
    width: 465,
    height: 200,
    altText: "Galerie",
  },
};

describe("ProductTile (4b SC-2)", () => {
  it("renders the tile image, not the thumbnail", () => {
    render(<ProductTile categorySlug="moebel" product={product} />);
    expect(screen.getByRole("img", { name: "Galerie" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Vorschau" })).toBeNull();
  });

  it("has square corners and a 2:1 image box", () => {
    const { container } = render(
      <ProductTile categorySlug="moebel" product={product} />
    );
    const link = screen.getByRole("link");
    expect(link.className).not.toMatch(/(^|\s)rounded/);
    expect(container.querySelector(".aspect-\\[2\\/1\\]")).not.toBeNull();
  });

  it("clamps name and subtitle to two lines each and reserves their height", () => {
    render(
      <ProductTile
        categorySlug="moebel"
        product={{ ...product, subtitle: "Untertitel" }}
      />
    );
    const name = screen.getByText("Testkeil");
    expect(name.className).toMatch(/\bline-clamp-2\b/);
    expect(name.className).toMatch(/\bh-12\b/);
    const subtitle = screen.getByText("Untertitel");
    expect(subtitle.className).toMatch(/\bline-clamp-2\b/);
    expect(subtitle.className).toMatch(/\bh-10\b/);
  });

  it("keeps the subtitle box without a subtitle", () => {
    const { container } = render(
      <ProductTile categorySlug="moebel" product={product} />
    );
    expect(container.querySelector(".h-10.line-clamp-2")).not.toBeNull();
  });

  it("shows 'Kein Bild' without a tile image", () => {
    render(
      <ProductTile
        categorySlug="moebel"
        product={{ ...product, tileImage: null }}
      />
    );
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });
});

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

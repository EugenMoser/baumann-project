import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductImage } from "./product-image";

describe("ProductImage (FR-10, SC-10)", () => {
  it("renders an image with intrinsic size and alt text", () => {
    render(
      <ProductImage
        image={{
          storagePath: "products/a.webp",
          width: 800,
          height: 600,
          altText: "Seitenansicht",
        }}
        name="Testkeil"
        sizes="100vw"
      />
    );
    const img = screen.getByRole("img", { name: "Seitenansicht" });
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "600");
  });

  it("renders a placeholder without an image element", () => {
    const { container } = render(
      <ProductImage image={null} name="Testkeil" sizes="100vw" />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });
});

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

  it("shows name and 'Kein Bild' for the default variant without an image", () => {
    render(<ProductImage image={null} name="Testkeil" sizes="100vw" />);
    expect(screen.getByText("Testkeil")).toBeInTheDocument();
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });

  it("shows name and 'Kein Bild' for the detail variant without an image", () => {
    render(
      <ProductImage
        image={null}
        name="Testkeil"
        sizes="100vw"
        variant="detail"
      />
    );
    expect(screen.getByText("Testkeil")).toBeInTheDocument();
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });

  it("renders an empty aria-hidden box for the thumb variant without an image", () => {
    const { container } = render(
      <ProductImage image={null} name="Testkeil" sizes="56px" variant="thumb" />
    );
    expect(screen.queryByText("Testkeil")).toBeNull();
    expect(screen.queryByText("Kein Bild")).toBeNull();
    expect(container.textContent).toBe("");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("keeps width and height from the ImageRef in the thumb variant", () => {
    render(
      <ProductImage
        image={{
          storagePath: "products/a.webp",
          width: 640,
          height: 480,
          altText: "Vorschau",
        }}
        name="Testkeil"
        sizes="56px"
        variant="thumb"
      />
    );
    const img = screen.getByRole("img", { name: "Vorschau" });
    expect(img).toHaveAttribute("width", "640");
    expect(img).toHaveAttribute("height", "480");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RegisterItem } from "@/lib/catalog/types";
import { CategoryRegister } from "./category-register";

const thumb = (n: number) => ({
  storagePath: `p/${n}.jpg`,
  width: 200,
  height: 150,
  altText: `Bild ${n}`,
});

const items: RegisterItem[] = [
  {
    slug: "moebelteile",
    name: "Möbelteile",
    productCount: 2,
    subline: "Griffe, Keile, Abdeckungen",
    thumbnails: [thumb(1), thumb(2)],
  },
  {
    slug: "sanitaer",
    name: "Sanitärteile",
    productCount: 1,
    subline: null,
    thumbnails: [],
  },
];

describe("CategoryRegister (D3)", () => {
  it("renders one link per item pointing at its category page", () => {
    render(<CategoryRegister items={items} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Möbelteile/ })).toHaveAttribute(
      "href",
      "/produkte/moebelteile"
    );
    expect(screen.getByRole("link", { name: /Sanitärteile/ })).toHaveAttribute(
      "href",
      "/produkte/sanitaer"
    );
  });

  it("shows a two-digit index per row", () => {
    render(<CategoryRegister items={items} />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("uses plural and singular for the product group count", () => {
    render(<CategoryRegister items={items} />);
    expect(screen.getByText("2 Produktgruppen")).toBeInTheDocument();
    expect(screen.getByText("1 Produktgruppe")).toBeInTheDocument();
  });

  it("shows the subline when present", () => {
    render(<CategoryRegister items={items} />);
    expect(screen.getByText("Griffe, Keile, Abdeckungen")).toBeInTheDocument();
  });

  it("renders no subline element for an item whose subline is null", () => {
    render(<CategoryRegister items={[items[1]]} />);
    const link = screen.getByRole("link", { name: /Sanitärteile/ });
    const texts = Array.from(link.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean);
    expect(texts.sort()).toEqual(
      ["01", "1 Produktgruppe", "Sanitärteile", "→"].sort()
    );
  });

  it("renders thumbnails as images with empty alt text", () => {
    const { container } = render(<CategoryRegister items={[items[0]]} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    imgs.forEach((img) => expect(img).toHaveAttribute("alt", ""));
  });

  it("renders no images for an item without thumbnails", () => {
    const { container } = render(<CategoryRegister items={[items[1]]} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders an ordered list", () => {
    render(<CategoryRegister items={items} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });
});

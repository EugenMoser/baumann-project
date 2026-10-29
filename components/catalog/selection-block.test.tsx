import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArticleOption, ColorOption } from "@/lib/catalog/variants";
import { SelectionProvider } from "./color-selection";
import { SelectionBlock } from "./selection-block";

const colorOptions: ColorOption[] = [
  {
    key: "color-3",
    name: "braun",
    ralReference: null,
    hexCode: "#6B4423",
    suffix: "1",
  },
  {
    key: "color-1",
    name: "weiß",
    ralReference: null,
    hexCode: "#F4F4F4",
    suffix: "2",
  },
];

const articleOptions: ArticleOption[] = [
  { articleNumber: "99010", label: "99010 · 8 mm" },
  { articleNumber: "99011", label: "99011 · 10 mm" },
];

const byArticle = {
  "99010": {
    numbers: { "color-3": "99010 - 1", "color-1": "99010 - 2" },
    fallback: "99010 - 1",
  },
  "99011": {
    numbers: { "color-3": "99011 - 1", "color-1": "99011 - 2" },
    fallback: "99011 - 1",
  },
};

function renderTestkeil() {
  render(
    <SelectionProvider defaultColor="color-3" articles={["99010", "99011"]}>
      <SelectionBlock
        articleOptions={articleOptions}
        colorOptions={colorOptions}
        byArticle={byArticle}
      />
    </SelectionProvider>
  );
}

const inquiryLink = () => screen.getByRole("link", { name: /Anfrage stellen/ });

describe("SelectionBlock (4b SC-4)", () => {
  it("starts on the first article and the default colour", () => {
    renderTestkeil();
    expect(screen.getByRole("region", { name: "Bestellung" })).toBeVisible();
    expect(screen.getByText("Bestell-Nr.")).toBeInTheDocument();
    expect(screen.getByText("99010 - 1")).toBeInTheDocument();
    expect(inquiryLink().getAttribute("href")).toContain(
      "bestellnummer=99010%20-%201"
    );
  });

  it("follows the chosen article and colour", () => {
    renderTestkeil();
    fireEvent.change(screen.getByRole("combobox", { name: "Artikel" }), {
      target: { value: "99011" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /weiß/ }));
    expect(screen.getByText("99011 - 2")).toBeInTheDocument();
    expect(inquiryLink().getAttribute("href")).toContain(
      "bestellnummer=99011%20-%202"
    );
  });

  it("offers no article select for a single article", () => {
    render(
      <SelectionProvider defaultColor="color-3" articles={["99010"]}>
        <SelectionBlock
          articleOptions={articleOptions.slice(0, 1)}
          colorOptions={colorOptions}
          byArticle={{ "99010": byArticle["99010"] }}
        />
      </SelectionProvider>
    );
    expect(screen.queryByRole("combobox", { name: "Artikel" })).toBeNull();
    expect(screen.getByRole("group", { name: "Farbe" })).toBeInTheDocument();
  });

  it("offers no colour group without colours and shows the bare number", () => {
    render(
      <SelectionProvider defaultColor={null} articles={["99300"]}>
        <SelectionBlock
          articleOptions={[{ articleNumber: "99300", label: "99300" }]}
          colorOptions={[]}
          byArticle={{ "99300": { numbers: {}, fallback: "99300" } }}
        />
      </SelectionProvider>
    );
    expect(screen.queryByRole("group", { name: "Farbe" })).toBeNull();
    expect(screen.getByText("99300")).toBeInTheDocument();
    expect(inquiryLink()).toHaveAttribute(
      "href",
      "/anfrage?bestellnummer=99300"
    );
  });

  it("links to the bare inquiry form without articles", () => {
    render(
      <SelectionProvider defaultColor={null} articles={[]}>
        <SelectionBlock articleOptions={[]} colorOptions={[]} byArticle={{}} />
      </SelectionProvider>
    );
    expect(screen.queryByText("Bestell-Nr.")).toBeNull();
    expect(inquiryLink()).toHaveAttribute("href", "/anfrage");
  });
});

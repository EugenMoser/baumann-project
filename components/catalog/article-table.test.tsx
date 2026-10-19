import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { buildVariantMatrix } from "@/lib/catalog/variants";
import { ArticleTable } from "./article-table";

describe("ArticleTable (FR-4, SC-4)", () => {
  const page = makeProductPage();

  function renderTable(articles = page.articles) {
    const p = makeProductPage({ articles });
    render(
      <ArticleTable
        productName={p.name}
        articles={articles}
        matrix={buildVariantMatrix(p)}
        productMaterial={p.material}
      />
    );
  }

  it("renders one row per article with anchor, attributes, note and packaging", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Art.-Nr.",
      "Bezeichnung",
      "Höhe",
      "Verpackungseinheit",
      "Bestell-Nr.",
    ]);
    const slashRow = document.getElementById("artikel-99211-80");
    expect(slashRow).not.toBeNull();
    expect(slashRow).toHaveTextContent("10,5 mm");
    expect(slashRow).toHaveTextContent("mit Bohrung");
    expect(slashRow).toHaveTextContent("Testkeil"); // falls back to the product name
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "100 Stück"
    );
  });

  it("shows the default-colour order number without interaction", () => {
    renderTable();
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "99010 - 1"
    );
  });

  it("has an attribute column instead of a combined Merkmale column", () => {
    renderTable();
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toContain("Höhe");
    expect(headers).not.toContain("Merkmale");
  });

  it("shows a dash for an article without the attribute", () => {
    const [first, second] = page.articles;
    renderTable([
      first,
      {
        ...second,
        attributes: [],
        packaging: [{ quantity: 50, label: null }],
      },
    ]);
    const row = document.getElementById("artikel-99211-80");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("–")).toBeInTheDocument();
  });

  it("right-aligns numeric attribute cells", () => {
    renderTable();
    expect(screen.getByRole("cell", { name: "8 mm" })).toHaveClass(
      "text-right"
    );
  });

  it("shows the article material only when it differs from the product material", () => {
    const [first, second] = page.articles;
    renderTable([
      { ...first, material: { code: "PA-6", name: "Polyamid 6" } },
      {
        ...second,
        material: { code: "POM", name: "Polyoxymethylen" },
        materialNote: "gefüllt",
      },
    ]);
    expect(document.getElementById("artikel-99010")).not.toHaveTextContent(
      "Material:"
    );
    expect(document.getElementById("artikel-99211-80")).toHaveTextContent(
      "Material: POM, gefüllt"
    );
  });

  it("wraps the table in a labelled, focusable region", () => {
    renderTable();
    const region = screen.getByRole("region", {
      name: `Artikel von ${page.name}`,
    });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { buildVariantMatrix } from "@/lib/catalog/variants";
import { ArticleTable } from "./article-table";

describe("ArticleTable (FR-4, SC-4)", () => {
  const page = makeProductPage();

  it("renders one row per article with anchor, attributes, note and packaging", () => {
    render(
      <ArticleTable
        productName={page.name}
        articles={page.articles}
        matrix={buildVariantMatrix(page)}
      />
    );
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Artikel-Nr.",
      "Bezeichnung",
      "Merkmale",
      "Verpackungseinheit",
      "Bestell-Nr.",
    ]);
    const slashRow = document.getElementById("artikel-99211-80");
    expect(slashRow).not.toBeNull();
    expect(slashRow).toHaveTextContent("Höhe: 10,5 mm");
    expect(slashRow).toHaveTextContent("mit Bohrung");
    expect(slashRow).toHaveTextContent("Testkeil"); // falls back to the product name
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "100 Stück"
    );
  });

  it("shows the default-colour order number without interaction", () => {
    render(
      <ArticleTable
        productName={page.name}
        articles={page.articles}
        matrix={buildVariantMatrix(page)}
      />
    );
    expect(document.getElementById("artikel-99010")).toHaveTextContent(
      "99010 - 1"
    );
  });
});

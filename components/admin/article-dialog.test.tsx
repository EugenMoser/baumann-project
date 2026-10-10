import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArticleDialog } from "./article-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const noop = async <S,>(s: S) => s;
const article = {
  id: 9,
  articleNumber: "99010",
  name: "Testkeil 8 mm",
  description: null,
  note: null,
  materialId: null,
  materialNote: null,
  sortOrder: 0,
  attributes: [],
  packaging: [],
};

describe("ArticleDialog (SC-9)", () => {
  it("makes the article number read-only when editing", () => {
    render(
      <ArticleDialog
        action={noop}
        productId={1}
        article={article}
        attributes={[]}
        materials={[]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Artikel 99010 bearbeiten" })
    );
    expect(screen.getByLabelText("Artikelnummer")).toHaveAttribute("readonly");
  });
  it("lets the number be typed when creating", () => {
    render(
      <ArticleDialog
        action={noop}
        productId={1}
        article={null}
        attributes={[]}
        materials={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Artikel hinzufügen" }));
    expect(screen.getByLabelText("Artikelnummer")).not.toHaveAttribute(
      "readonly"
    );
  });
});

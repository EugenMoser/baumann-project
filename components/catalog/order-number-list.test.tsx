import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { OrderNumberList } from "./order-number-list";

describe("OrderNumberList (FR-5, D6)", () => {
  it("lists every order number with its colour as visible text", () => {
    render(<OrderNumberList page={makeProductPage()} />);
    for (const n of [
      "99010 - 1",
      "99010 - 2",
      "99211/80 - 1",
      "99211/80 - 2",
    ]) {
      expect(screen.getByText(n, { exact: false })).toBeVisible();
    }
    expect(
      screen.getByRole("heading", { name: "Alle Bestellnummern" })
    ).toBeInTheDocument();
  });

  it("links every order number to the inquiry form (FR-13, SC-13)", () => {
    const page = makeProductPage();
    render(<OrderNumberList page={page} />);
    for (const v of page.variants) {
      expect(
        screen.getByRole("link", { name: new RegExp(v.orderNumber) })
      ).toHaveAttribute(
        "href",
        `/anfrage?bestellnummer=${encodeURIComponent(v.orderNumber)}`
      );
    }
  });
});

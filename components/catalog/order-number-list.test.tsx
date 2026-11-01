import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeProductPage } from "@/lib/catalog/fixtures";
import { inquiryPath } from "@/lib/inquiry/path";
import { OrderNumberList } from "./order-number-list";

describe("OrderNumberList (4b SC-5)", () => {
  it("renders a closed details with the count in the summary (4b SC-5)", () => {
    const { container } = render(<OrderNumberList page={makeProductPage()} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(container.querySelector("summary")).toHaveTextContent(
      "Alle Bestellnummern (4)"
    );
  });

  it("keeps every order number in the text content (4b SC-5)", () => {
    const { container } = render(<OrderNumberList page={makeProductPage()} />);
    const text = container.querySelector("details")?.textContent ?? "";
    for (const n of [
      "99010 - 1",
      "99010 - 2",
      "99211/80 - 1",
      "99211/80 - 2",
    ]) {
      expect(text).toContain(n);
    }
  });

  it("links every order number to the inquiry form (4b SC-5)", () => {
    const page = makeProductPage();
    render(<OrderNumberList page={page} />);
    for (const v of page.variants) {
      expect(
        screen.getByRole("link", {
          name: new RegExp(v.orderNumber),
          hidden: true,
        })
      ).toHaveAttribute("href", inquiryPath(v.orderNumber));
    }
  });

  it("has no heading named Alle Bestellnummern (4b SC-5)", () => {
    render(<OrderNumberList page={makeProductPage()} />);
    expect(
      screen.queryByRole("heading", { name: /Alle Bestellnummern/ })
    ).toBeNull();
  });
});

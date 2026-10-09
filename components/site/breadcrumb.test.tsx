import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "./breadcrumb";

describe("Breadcrumb", () => {
  it("links all but the last item and marks the current page", () => {
    render(
      <Breadcrumb
        items={[{ label: "Produkte", href: "/produkte" }, { label: "Möbel" }]}
      />
    );
    expect(
      screen.getByRole("navigation", { name: "Brotkrumen" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/produkte"
    );
    expect(screen.getByText("Möbel")).toHaveAttribute("aria-current", "page");
  });
});

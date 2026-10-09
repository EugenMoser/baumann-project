import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { placeholderBranding } from "@/config/branding";
import { SiteHeader } from "./site-header";

describe("SiteHeader (FR-1, SC-1)", () => {
  it("renders wordmark, catalog link and a GET search form", () => {
    render(<SiteHeader branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: /Beispiel/ })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Produkte" })).toHaveAttribute(
      "href",
      "/produkte"
    );
    const form = screen.getByRole("search", { name: "Katalogsuche" });
    expect(form).toHaveAttribute("action", "/suche");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
  });

  it("links the quality and inquiry pages (FR-13, SC-13)", () => {
    render(<SiteHeader branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: "Qualität" })).toHaveAttribute(
      "href",
      "/qualitaet"
    );
    expect(screen.getByRole("link", { name: "Anfrage" })).toHaveAttribute(
      "href",
      "/anfrage"
    );
  });
});

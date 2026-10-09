import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { placeholderBranding } from "@/config/branding";
import { SiteFooter } from "./site-footer";

describe("SiteFooter (FR-1, SC-1)", () => {
  it("links to the official site and the developer", () => {
    render(<SiteFooter branding={placeholderBranding} />);
    expect(
      screen.getByRole("link", { name: /offizielle Website/ })
    ).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: /Eugen Moser/ })).toHaveAttribute(
      "href",
      "https://eugen-moser.com"
    );
  });

  it("links imprint, privacy and the quality page (FR-1, SC-1)", () => {
    render(<SiteFooter branding={placeholderBranding} />);
    expect(screen.getByRole("link", { name: "Impressum" })).toHaveAttribute(
      "href",
      placeholderBranding.developer.imprintUrl
    );
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      placeholderBranding.developer.privacyUrl
    );
    expect(screen.getByRole("link", { name: "Qualität" })).toHaveAttribute(
      "href",
      "/qualitaet"
    );
  });
});

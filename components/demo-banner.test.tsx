import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Branding } from "@/config/branding";
import { DemoBanner } from "./demo-banner";

const fixture: Branding = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  qualityPolicy: ["Ein Absatz."],
  developer: {
    name: "Dev Person",
    url: "https://dev.example",
    imprintUrl: "https://dev.example/impressum",
    privacyUrl: "https://dev.example/datenschutz",
  },
};

describe("DemoBanner (FR-1, SC-5)", () => {
  it("renders the preview notice from the branding config", () => {
    render(<DemoBanner branding={fixture} />);
    const banner = screen.getByRole("region", { name: "Hinweis zur Vorschau" });
    expect(banner).toHaveTextContent("Vorschau");
    expect(banner).toHaveTextContent("Testprojekt (Vorschau)");
    expect(banner).toHaveTextContent("Example GmbH");
  });

  it("links to the official site and to the developer", () => {
    render(<DemoBanner branding={fixture} />);
    expect(
      screen.getByRole("link", { name: "Zur offiziellen Seite" })
    ).toHaveAttribute("href", "https://example.com");
    expect(
      screen.getByRole("link", { name: "Umsetzung: Dev Person" })
    ).toHaveAttribute("href", "https://dev.example");
  });

  it("does not double the period after a company name ending in a period", () => {
    render(
      <DemoBanner
        branding={{ ...fixture, companyName: "Example Spritzguss e.K." }}
      />
    );
    const banner = screen.getByRole("region", { name: "Hinweis zur Vorschau" });
    expect(banner.textContent).toContain("Example Spritzguss e.K.");
    expect(banner.textContent).not.toContain("..");
  });

  it("appends exactly one period after a company name without one", () => {
    render(<DemoBanner branding={fixture} />);
    const banner = screen.getByRole("region", { name: "Hinweis zur Vorschau" });
    expect(banner.textContent).toContain("Website von Example GmbH.");
    expect(banner.textContent).not.toContain("..");
  });

  it("cannot be dismissed", () => {
    render(<DemoBanner branding={fixture} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

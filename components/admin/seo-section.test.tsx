import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeoSection } from "./seo-section";

const auto = { title: "Auto-Titel", description: "Auto-Beschreibung." };
const empty = { seoTitle: "", seoDescription: "" };

function details() {
  return document.querySelector("details") as HTMLDetailsElement;
}

describe("SeoSection (6c SC-3)", () => {
  it("is closed with empty values", () => {
    render(<SeoSection values={empty} errors={{}} auto={auto} />);
    expect(details().open).toBe(false);
    expect(screen.getByText("Suchmaschinen (optional)")).toBeInTheDocument();
  });

  it("is open when only the description has a value", () => {
    render(
      <SeoSection
        values={{ seoTitle: "", seoDescription: "Eigene" }}
        errors={{}}
        auto={auto}
      />
    );
    expect(details().open).toBe(true);
    expect(screen.getByLabelText("Titel für Suchmaschinen")).toHaveAttribute(
      "placeholder",
      "Auto-Titel"
    );
  });

  it("is open when a field has an error", () => {
    render(
      <SeoSection
        values={empty}
        errors={{ seoTitle: "Zu lang." }}
        auto={auto}
      />
    );
    expect(details().open).toBe(true);
    expect(screen.getByText("Zu lang.")).toBeInTheDocument();
  });

  it("uses the automatic values as placeholders", () => {
    render(<SeoSection values={empty} errors={{}} auto={auto} />);
    expect(screen.getByLabelText("Titel für Suchmaschinen")).toHaveAttribute(
      "placeholder",
      auto.title
    );
    expect(
      screen.getByLabelText("Beschreibung für Suchmaschinen")
    ).toHaveAttribute("placeholder", auto.description);
    expect(screen.getByText("Höchstens 70 Zeichen.")).toBeInTheDocument();
    expect(screen.getByText("Höchstens 160 Zeichen.")).toBeInTheDocument();
  });
});

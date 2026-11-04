import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeoSection } from "./seo-section";

const auto = { title: "Auto-Titel", description: "Auto-Beschreibung." };
const empty = { seoTitle: "", seoDescription: "" };
const noop = () => {};

function details() {
  return document.querySelector("details") as HTMLDetailsElement;
}

// Closes the section like a user would; jsdom fires the toggle event itself.
async function closeDetails() {
  await act(async () => {
    details().open = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("SeoSection (6c SC-3)", () => {
  it("is closed with empty values", () => {
    render(
      <SeoSection
        onChange={noop}
        origin="human"
        values={empty}
        errors={{}}
        auto={auto}
      />
    );
    expect(details().open).toBe(false);
    expect(screen.getByText("Suchmaschinen (optional)")).toBeInTheDocument();
  });

  it("is open when only the description has a value", () => {
    render(
      <SeoSection
        onChange={noop}
        origin="human"
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
        onChange={noop}
        origin="human"
        values={empty}
        errors={{ seoTitle: "Zu lang." }}
        auto={auto}
      />
    );
    expect(details().open).toBe(true);
    expect(screen.getByText("Zu lang.")).toBeInTheDocument();
  });

  it("opens when a suggestion box appears and stays open afterwards", () => {
    const { rerender } = render(
      <SeoSection
        onChange={noop}
        origin="human"
        values={empty}
        errors={{}}
        auto={auto}
      />
    );
    expect(details().open).toBe(false);
    rerender(
      <SeoSection
        onChange={noop}
        origin="human"
        values={empty}
        errors={{}}
        auto={auto}
        boxesKey="1"
        boxes={{ seoTitle: <p>Box</p> }}
      />
    );
    expect(details().open).toBe(true);
    expect(screen.getByText("Box")).toBeInTheDocument();
    rerender(
      <SeoSection
        onChange={noop}
        origin="human"
        values={empty}
        errors={{}}
        auto={auto}
      />
    );
    expect(details().open).toBe(true);
  });

  it("reopens for every new boxesKey even when the user closed it", async () => {
    const props = {
      onChange: noop,
      origin: "human" as const,
      values: { seoTitle: "Eigener Titel", seoDescription: "" },
      errors: {},
      auto,
    };
    const { rerender } = render(<SeoSection {...props} />);
    expect(details().open).toBe(true);
    await closeDetails();
    rerender(
      <SeoSection {...props} boxesKey="1-2" boxes={{ seoTitle: <p>A</p> }} />
    );
    expect(details().open).toBe(true);
    await closeDetails();
    rerender(
      <SeoSection {...props} boxesKey="3-4" boxes={{ seoTitle: <p>B</p> }} />
    );
    expect(details().open).toBe(true);
  });

  it("reports edits and shows the origin badge in the summary", () => {
    const onChange = vi.fn();
    render(
      <SeoSection
        onChange={onChange}
        origin="ai"
        values={{ seoTitle: "A", seoDescription: "B" }}
        errors={{}}
        auto={auto}
      />
    );
    fireEvent.change(screen.getByLabelText("Titel für Suchmaschinen"), {
      target: { value: "Neu" },
    });
    expect(onChange).toHaveBeenCalledWith("seoTitle", "Neu");
    expect(screen.getByLabelText("Titel für Suchmaschinen")).toHaveValue("A");
    expect(document.querySelector("summary")).toHaveTextContent("KI-generiert");
  });

  it("uses the automatic values as placeholders", () => {
    render(
      <SeoSection
        onChange={noop}
        origin="human"
        values={empty}
        errors={{}}
        auto={auto}
      />
    );
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

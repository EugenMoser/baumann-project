import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the eyebrow text", () => {
    render(<PageHeader eyebrow="Katalog" title="Keile" />);
    expect(screen.getByText("Katalog")).toBeInTheDocument();
  });

  it("renders the title as h1 with the given id", () => {
    render(<PageHeader title="Keile" titleId="page-title" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Keile" });
    expect(h1).toHaveAttribute("id", "page-title");
  });

  it("renders the title as h1 without an id when none is given", () => {
    render(<PageHeader title="Keile" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Keile" });
    expect(h1).not.toHaveAttribute("id");
  });

  it("renders the lead text", () => {
    render(<PageHeader title="Keile" lead="Spritzgussteile fuer Caravans" />);
    expect(
      screen.getByText("Spritzgussteile fuer Caravans")
    ).toBeInTheDocument();
  });

  it("renders only the title when eyebrow and lead are omitted", () => {
    const { container } = render(<PageHeader title="Keile" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

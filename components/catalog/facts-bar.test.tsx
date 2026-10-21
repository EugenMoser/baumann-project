import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FactsBar } from "./facts-bar";

describe("FactsBar (D3)", () => {
  it("renders every value together with its label", () => {
    render(
      <FactsBar
        facts={[
          { value: "1984", label: "gegründet" },
          { value: "ISO 9001", label: "zertifiziert" },
        ]}
      />
    );
    for (const t of ["1984", "gegründet", "ISO 9001", "zertifiziert"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<FactsBar facts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

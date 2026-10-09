import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiLabel } from "./ai-label";

describe("AiLabel (FR-13, SC-13)", () => {
  it("renders for ai and nothing for human", () => {
    const { container, rerender } = render(<AiLabel origin="ai" />);
    expect(screen.getByText("KI-generiert")).toBeInTheDocument();
    rerender(<AiLabel origin="human" />);
    expect(container).toBeEmptyDOMElement();
  });
});

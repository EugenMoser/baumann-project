import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./json-ld";

describe("JsonLd (FR-7, SC-7)", () => {
  it("renders escaped JSON in an ld+json script", () => {
    const { container } = render(<JsonLd data={{ name: "<b>" }} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(script?.innerHTML).toBe('{"name":"\\u003cb>"}');
  });
});

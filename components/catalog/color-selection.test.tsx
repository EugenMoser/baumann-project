import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ColorPicker,
  ColorSelectionProvider,
  InquiryLink,
  SelectedOrderNumber,
} from "./color-selection";

const options = [
  {
    key: "color-3",
    name: "braun",
    ralReference: null,
    hexCode: "#6B4423",
    suffix: "1",
  },
  {
    key: "color-1",
    name: "weiß",
    ralReference: "ähnlich RAL 9016",
    hexCode: "#F4F4F4",
    suffix: "2",
  },
];

describe("ColorPicker (FR-5, SC-5)", () => {
  it("switches the shown order numbers", () => {
    render(
      <ColorSelectionProvider defaultKey="color-3">
        <ColorPicker options={options} />
        <SelectedOrderNumber
          numbers={{ "color-3": "99010 - 1", "color-1": "99010 - 2" }}
          fallback="99010 - 1"
        />
      </ColorSelectionProvider>
    );
    expect(screen.getByText("99010 - 1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /braun/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /weiß/ }));
    expect(screen.getByText("99010 - 2")).toBeInTheDocument();
  });

  it("shows the fallback outside a provider", () => {
    render(<SelectedOrderNumber numbers={{}} fallback="99300" />);
    expect(screen.getByText("99300")).toBeInTheDocument();
  });
});

describe("InquiryLink (FR-4, SC-4)", () => {
  it("follows the selected colour inside a provider", () => {
    render(
      <ColorSelectionProvider defaultKey="color-3">
        <ColorPicker options={options} />
        <InquiryLink
          numbers={{ "color-3": "99010 - 1", "color-1": "99010 - 2" }}
          fallback="99010 - 1"
        >
          Anfrage stellen
        </InquiryLink>
      </ColorSelectionProvider>
    );
    const link = screen.getByRole("link", { name: "Anfrage stellen" });
    expect(link).toHaveAttribute(
      "href",
      "/anfrage?bestellnummer=99010%20-%201"
    );
    fireEvent.click(screen.getByRole("radio", { name: /weiß/ }));
    expect(link).toHaveAttribute(
      "href",
      "/anfrage?bestellnummer=99010%20-%202"
    );
  });

  it("uses the fallback outside a provider", () => {
    render(
      <InquiryLink numbers={{}} fallback="99300">
        Anfrage stellen
      </InquiryLink>
    );
    expect(
      screen.getByRole("link", { name: "Anfrage stellen" })
    ).toHaveAttribute("href", "/anfrage?bestellnummer=99300");
  });
});

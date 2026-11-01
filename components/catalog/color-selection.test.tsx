import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ColorPicker,
  SelectedOrderNumber,
  SelectionProvider,
  useSelection,
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
      <SelectionProvider defaultColor="color-3" articles={["99010"]}>
        <ColorPicker options={options} />
        <SelectedOrderNumber
          numbers={{ "color-3": "99010 - 1", "color-1": "99010 - 2" }}
          fallback="99010 - 1"
        />
      </SelectionProvider>
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

  it("renders nothing without options", () => {
    render(
      <SelectionProvider defaultColor={null} articles={["99010"]}>
        <ColorPicker options={[]} />
      </SelectionProvider>
    );
    expect(screen.queryByRole("group", { name: "Farbe" })).toBeNull();
  });
});

function Probe() {
  const selection = useSelection();
  return <p data-testid="probe">{selection?.article ?? "none"}</p>;
}

describe("SelectionProvider hash (4b SC-4)", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  const renderProbe = (articles: string[]) =>
    render(
      <SelectionProvider defaultColor="color-3" articles={articles}>
        <Probe />
      </SelectionProvider>
    );

  it("selects the first article without a hash", () => {
    renderProbe(["99010", "99011"]);
    expect(screen.getByTestId("probe")).toHaveTextContent("99010");
  });

  it("selects the article named by the hash on mount", () => {
    window.location.hash = "#artikel-99011";
    renderProbe(["99010", "99011"]);
    expect(screen.getByTestId("probe")).toHaveTextContent("99011");
  });

  it("keeps the default for an unknown hash", () => {
    window.location.hash = "#artikel-12345";
    renderProbe(["99010", "99011"]);
    expect(screen.getByTestId("probe")).toHaveTextContent("99010");
  });

  it("matches slashes in article numbers through the anchor id", () => {
    window.location.hash = "#artikel-99211-90";
    renderProbe(["99211/80", "99211/90"]);
    expect(screen.getByTestId("probe")).toHaveTextContent("99211/90");
  });

  it("follows later hash changes", () => {
    renderProbe(["99010", "99011"]);
    act(() => {
      window.location.hash = "#artikel-99011";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("99011");
  });

  it("leaves the selection for a foreign hash change", () => {
    window.location.hash = "#artikel-99011";
    renderProbe(["99010", "99011"]);
    act(() => {
      window.location.hash = "#artikel";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("99011");
  });
});

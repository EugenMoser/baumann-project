import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorSection } from "./color-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const noop = async <S,>(s: S) => s;
const colors = [
  { id: 1, name: "weiß", hexCode: "#F4F4F4" },
  { id: 2, name: "grau", hexCode: "#999999" },
  { id: 3, name: "braun", hexCode: "#663300" },
];

describe("ColorSection", () => {
  it("adds, defaults and removes rows", () => {
    render(
      <ColorSection action={noop} productId={1} initial={[]} colors={colors} />
    );
    expect(screen.queryByLabelText("Suffix")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Farbe hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Farbe hinzufügen" }));
    const selects = screen.getAllByLabelText("Farbe");
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue("1");
    expect(selects[1]).toHaveValue("2");
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    fireEvent.click(radios[1]);
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
    fireEvent.change(screen.getAllByLabelText("Suffix")[1], {
      target: { value: "2" },
    });
    expect(screen.getAllByLabelText("Suffix")[1]).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Farbe 1 entfernen" }));
    expect(screen.getAllByLabelText("Suffix")).toHaveLength(1);
    expect(screen.getByLabelText("Suffix")).toHaveValue("2");
    expect(screen.getByRole("radio")).toBeChecked();
  });
  it("moves the default to the first remaining row when the default is removed", () => {
    const initial = [
      { colorId: 1, suffix: "1", isDefault: false, sortOrder: 0 },
      { colorId: 2, suffix: "2", isDefault: true, sortOrder: 1 },
      { colorId: 3, suffix: "3", isDefault: false, sortOrder: 2 },
    ];
    render(
      <ColorSection
        action={noop}
        productId={1}
        initial={initial}
        colors={colors}
      />
    );
    expect(screen.getAllByRole("radio")[1]).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Farbe 2 entfernen" }));
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[0]).toHaveAttribute("value", "1");
  });
  it("makes an added row the default when no default exists", () => {
    const initial = [
      { colorId: 1, suffix: "1", isDefault: false, sortOrder: 0 },
    ];
    render(
      <ColorSection
        action={noop}
        productId={1}
        initial={initial}
        colors={colors}
      />
    );
    expect(screen.getByRole("radio")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Farbe hinzufügen" }));
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
    expect(radios[1]).toHaveAttribute("value", "2");
  });
});

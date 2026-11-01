import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ColorValues } from "@/lib/admin/color-schema";
import type { FormState } from "@/lib/admin/form";
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

describe("ColorSection ordering (6c SC-4, SC-5)", () => {
  const three = [
    { colorId: 1, suffix: "1", isDefault: false, sortOrder: 0 },
    { colorId: 2, suffix: "2", isDefault: true, sortOrder: 1 },
    { colorId: 3, suffix: "3", isDefault: false, sortOrder: 2 },
  ];
  const renderThree = (
    action: Parameters<typeof ColorSection>[0]["action"] = noop
  ) =>
    render(
      <ColorSection
        action={action}
        productId={1}
        initial={three}
        colors={colors}
      />
    );

  it("has no Reihenfolge field and explains the position", () => {
    renderThree();
    expect(screen.queryByLabelText("Reihenfolge")).toBeNull();
    expect(
      screen.getByText(/Position 1 ist die erste Farbe auf der Produktseite\./)
    ).toBeInTheDocument();
  });

  it("submits the colours in the moved order", async () => {
    const seen: string[][] = [];
    const action = async (
      prev: FormState<ColorValues>,
      fd: FormData
    ): Promise<FormState<ColorValues>> => {
      seen.push(fd.getAll("colorId").map(String));
      return prev;
    };
    renderThree(action);
    fireEvent.click(screen.getByRole("button", { name: "Farbe 2 nach oben" }));
    fireEvent.click(screen.getByRole("button", { name: "Farben speichern" }));
    await waitFor(() => expect(seen).toEqual([["2", "1", "3"]]));
  });

  it("keeps position and default when the colour of a moved row changes", () => {
    render(
      <ColorSection
        action={noop}
        productId={1}
        initial={three.slice(0, 2)}
        colors={colors}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Farbe 2 nach oben" }));
    // The grey row (the default) is now first.
    const before = screen.getAllByLabelText("Farbe");
    expect(before.map((s) => (s as HTMLSelectElement).value)).toEqual([
      "2",
      "1",
    ]);
    fireEvent.change(before[0]!, { target: { value: "3" } });
    const after = screen.getAllByLabelText("Farbe");
    expect(after.map((s) => (s as HTMLSelectElement).value)).toEqual([
      "3",
      "1",
    ]);
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(radios[0]).toHaveAttribute("value", "3");
    expect(radios[1]).not.toBeChecked();
  });

  it("renumbers the rows after a removal", () => {
    renderThree();
    fireEvent.click(screen.getByRole("button", { name: "Farbe 1 entfernen" }));
    expect(
      screen.getByRole("button", { name: "Farbe 1 entfernen" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Farbe 2 entfernen" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Farbe 3 entfernen" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Farbe 2 nach unten" })
    ).toBeDisabled();
  });
});

describe("ColorSection help (6c SC-5)", () => {
  const initial = [{ colorId: 1, suffix: "1", isDefault: true, sortOrder: 0 }];
  const text =
    "Die Standardfarbe ist auf der Produktseite vorausgewählt. Ihre Bestellnummer steht im Auswahlblock, bis jemand eine andere Farbe wählt.";
  it("explains Standard on click and returns focus on Escape", async () => {
    render(
      <ColorSection
        action={noop}
        productId={1}
        initial={initial}
        colors={colors}
      />
    );
    const button = screen.getByRole("button", {
      name: "Was bedeutet Standard?",
    });
    fireEvent.click(button);
    expect(screen.getByText(text)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText(text), { key: "Escape" });
    expect(screen.queryByText(text)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
  it("has one help button per row", () => {
    const two = [
      ...initial,
      { colorId: 2, suffix: "2", isDefault: false, sortOrder: 1 },
    ];
    render(
      <ColorSection action={noop} productId={1} initial={two} colors={colors} />
    );
    expect(
      screen.getAllByRole("button", { name: "Was bedeutet Standard?" })
    ).toHaveLength(2);
  });
});

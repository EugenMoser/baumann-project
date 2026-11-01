import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SortableList } from "./sortable-list";

type Item = { id: string; name: string };
const start: Item[] = [
  { id: "a", name: "weiß" },
  { id: "b", name: "grau" },
  { id: "c", name: "braun" },
];

function Wrapper() {
  const [items, setItems] = useState(start);
  return (
    <SortableList
      items={items}
      getKey={(i) => i.id}
      getLabel={(i) => i.name}
      noun="Farbe"
      onReorder={setItems}
      renderItem={(i) => <span data-testid="item">{i.name}</span>}
    />
  );
}

const order = () => screen.getAllByTestId("item").map((el) => el.textContent);
const button = (name: string) => screen.getByRole("button", { name });

describe("SortableList (6c SC-4)", () => {
  it("shows positions and disables the outer buttons", () => {
    render(<Wrapper />);
    const positions = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("[data-testid=position]")?.textContent);
    expect(positions).toEqual(["1", "2", "3"]);
    expect(button("Farbe 1 nach oben")).toBeDisabled();
    expect(button("Farbe 3 nach unten")).toBeDisabled();
    expect(button("Farbe 2 nach oben")).toBeEnabled();
  });

  it("moves a row up, announces it and focuses the other button at the top end", () => {
    const { container } = render(<Wrapper />);
    fireEvent.click(button("Farbe 2 nach oben"));
    expect(order()).toEqual(["grau", "weiß", "braun"]);
    const live = container.querySelector("[aria-live=polite]");
    expect(live?.textContent).toBe("grau steht jetzt auf Position 1 von 3.");
    // "grau" is now row 1, whose up button is disabled.
    expect(button("Farbe 1 nach unten")).toHaveFocus();
  });

  it("moves a row down and focuses the down button of the moved row", () => {
    render(<Wrapper />);
    fireEvent.click(button("Farbe 1 nach unten"));
    expect(order()).toEqual(["grau", "weiß", "braun"]);
    expect(button("Farbe 2 nach unten")).toHaveFocus();
  });

  it("focuses the up button when the down button becomes disabled", () => {
    render(<Wrapper />);
    fireEvent.click(button("Farbe 2 nach unten"));
    expect(order()).toEqual(["weiß", "braun", "grau"]);
    expect(button("Farbe 3 nach oben")).toHaveFocus();
  });

  it("keeps the handle out of the tab order and hidden from assistive technology", () => {
    render(<Wrapper />);
    const handles = screen.getAllByTestId("drag-handle");
    expect(handles).toHaveLength(3);
    for (const h of handles) {
      expect(h).toHaveAttribute("aria-hidden", "true");
      expect(h).not.toHaveAttribute("tabindex");
    }
  });

  it("renders no English library texts", () => {
    render(<Wrapper />);
    expect(screen.queryByText(/pick up/i)).toBeNull();
  });
});

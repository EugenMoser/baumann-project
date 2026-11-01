import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpPopover } from "./help-popover";

describe("HelpPopover (6c SC-5)", () => {
  it("opens on click, closes on Escape and returns focus to the button", async () => {
    render(<HelpPopover label="Hilfe">Erklärung</HelpPopover>);
    const button = screen.getByRole("button", { name: "Hilfe" });
    expect(screen.queryByText("Erklärung")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByText("Erklärung")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("Erklärung"), { key: "Escape" });
    expect(screen.queryByText("Erklärung")).toBeNull();
    // Radix restores focus asynchronously after unmount.
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("is a focusable native button, so Enter and Space activate it like a click", () => {
    // jsdom does not turn Enter/Space into a click; browsers do for a native
    // <button type="button">, which is what this asserts.
    render(<HelpPopover label="Hilfe">Erklärung</HelpPopover>);
    const button = screen.getByRole("button", { name: "Hilfe" });
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(screen.getByText("Erklärung")).toBeInTheDocument();
  });

  it("closes on a second click", () => {
    render(<HelpPopover label="Hilfe">Erklärung</HelpPopover>);
    const button = screen.getByRole("button", { name: "Hilfe" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByText("Erklärung")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/admin/form";
import type { ColorMasterValues } from "@/lib/admin/master-schema";
import { toast } from "sonner";
import { ColorDialog } from "./color-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

type Action = (
  prev: FormState<ColorMasterValues>,
  formData: FormData
) => Promise<FormState<ColorMasterValues>>;

const color = {
  id: 4,
  name: "weiß",
  ralReference: "RAL 9016",
  hexCode: "#F4F4F4",
  family: "weiß",
  productCount: 2,
};
const open = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => vi.mocked(toast.success).mockClear());

describe("ColorDialog (SC-11)", () => {
  it("submits the typed values and the id, closes and toasts on saved", async () => {
    const action = vi.fn<Action>(async (prev, fd) => ({
      ...prev,
      status: "saved",
      values: { ...prev.values, name: String(fd.get("name")) },
    }));
    render(<ColorDialog action={action} color={color} families={["weiß"]} />);
    open("Farbe „weiß“ bearbeiten");
    expect(screen.getByLabelText("Farbcode")).toHaveValue("#F4F4F4");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Reinweiß" },
    });
    fireEvent.change(screen.getByLabelText("Farbcode"), {
      target: { value: "#a1b2c3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(fd?.entries() ?? [])).toEqual({
      id: "4",
      name: "Reinweiß",
      ralReference: "RAL 9016",
      hexCode: "#a1b2c3",
      family: "weiß",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Farbe gespeichert.");
  });

  it("sends an empty id when creating and previews a valid hex code", () => {
    render(<ColorDialog action={async (s) => s} color={null} families={[]} />);
    open("Farbe anlegen");
    expect(screen.getByLabelText("Farbcode")).toHaveValue("#");
    const swatch = screen.getByTestId("color-swatch");
    fireEvent.change(screen.getByLabelText("Farbcode"), {
      target: { value: "#a1b2c3" },
    });
    expect(swatch.style.background).toBe("rgb(161, 178, 195)");
  });

  it("shows field errors with aria wiring and keeps the dialog open", async () => {
    const action = vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "error",
      fieldErrors: { hexCode: "Bitte einen Farbcode wie #A1B2C3 eingeben." },
      formError: null,
    }));
    render(<ColorDialog action={action} color={null} families={[]} />);
    open("Farbe anlegen");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const message = await screen.findByText(
      "Bitte einen Farbcode wie #A1B2C3 eingeben."
    );
    const input = screen.getByLabelText("Farbcode");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a form error as an alert", async () => {
    const action = vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "error",
      formError: "Speichern fehlgeschlagen.",
    }));
    render(<ColorDialog action={action} color={null} families={[]} />);
    open("Farbe anlegen");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen."
    );
  });
});

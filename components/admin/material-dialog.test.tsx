import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/admin/form";
import type { MaterialValues } from "@/lib/admin/master-schema";
import { toast } from "sonner";
import { MaterialDialog } from "./material-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

type Action = (
  prev: FormState<MaterialValues>,
  formData: FormData
) => Promise<FormState<MaterialValues>>;

const material = {
  id: 7,
  code: "PA-6",
  name: "Polyamid 6",
  productCount: 1,
  articleCount: 0,
};
const open = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => vi.mocked(toast.success).mockClear());

describe("MaterialDialog (SC-11)", () => {
  it("submits the typed values and the id, closes and toasts on saved", async () => {
    const action = vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "saved",
    }));
    render(<MaterialDialog action={action} material={material} />);
    open("Material „PA-6“ bearbeiten");
    expect(screen.getByLabelText("Kürzel")).toHaveValue("PA-6");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Polyamid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(fd?.entries() ?? [])).toEqual({
      id: "7",
      code: "PA-6",
      name: "Polyamid",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Material gespeichert.");
  });

  it("sends an empty id when creating", async () => {
    const action = vi.fn<Action>(async (prev) => prev);
    render(<MaterialDialog action={action} material={null} />);
    open("Material anlegen");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]?.[1].get("id")).toBe("");
  });

  it("shows the duplicate-code conflict with aria wiring", async () => {
    const action = vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "error",
      fieldErrors: { code: "Dieses Kürzel gibt es schon." },
    }));
    render(<MaterialDialog action={action} material={null} />);
    open("Material anlegen");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const message = await screen.findByText("Dieses Kürzel gibt es schon.");
    const input = screen.getByLabelText("Kürzel");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a form error as an alert", async () => {
    const action = vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "error",
      formError: "Speichern fehlgeschlagen.",
    }));
    render(<MaterialDialog action={action} material={null} />);
    open("Material anlegen");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen."
    );
  });
});

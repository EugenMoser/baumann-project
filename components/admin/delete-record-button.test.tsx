import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/admin/form";
import { DeleteRecordButton } from "./delete-record-button";

const props = {
  id: 12,
  title: "Kategorie löschen?",
  description: "Die Kategorie wird endgültig gelöscht.",
  buttonLabel: "Kategorie löschen",
};
const idle: FormState<null> = {
  status: "idle",
  values: null,
  fieldErrors: {},
  formError: null,
};

describe("DeleteRecordButton", () => {
  it("opens the dialog and submits the id on confirmation", async () => {
    const action = vi.fn<
      (p: FormState<null>, fd: FormData) => Promise<FormState<null>>
    >(async () => idle);
    render(<DeleteRecordButton action={action} {...props} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kategorie löschen" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Die Kategorie wird endgültig gelöscht."
    );
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]?.[1];
    expect(submitted?.get("id")).toBe("12");
  });

  it("shows the refusal from the action as an alert", async () => {
    const action = vi.fn(async (): Promise<FormState<null>> => ({
      ...idle,
      status: "error",
      formError: "Die Kategorie enthält noch Produkte.",
    }));
    render(<DeleteRecordButton action={action} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Kategorie löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Kategorie enthält noch Produkte."
    );
  });

  it("does not submit when the dialog is cancelled", () => {
    const action = vi.fn(async () => idle);
    render(<DeleteRecordButton action={action} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Kategorie löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes the dialog once the action reports saved", async () => {
    const action = vi.fn(async (): Promise<FormState<null>> => ({
      ...idle,
      status: "saved",
    }));
    render(<DeleteRecordButton action={action} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Kategorie löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(action).toHaveBeenCalledTimes(1);
  });
});

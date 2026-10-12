import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { FormState } from "@/lib/admin/form";
import { RemoveImageButton } from "./remove-image-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const result = (over: Partial<FormState<null>>) =>
  vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (prev: FormState<null>, _fd: FormData): Promise<FormState<null>> => ({
      ...prev,
      ...over,
    })
  );

function open(action: ReturnType<typeof result>) {
  render(
    <RemoveImageButton
      action={action}
      productId={3}
      mediaId={7}
      label="Bild 1"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Bild 1 entfernen" }));
}

describe("RemoveImageButton", () => {
  beforeEach(() => vi.mocked(toast.success).mockClear());

  it("opens the dialog and submits ids, then toasts", async () => {
    const action = result({ status: "saved" });
    open(action);
    expect(screen.getByText("Bild entfernen?")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Endgültig entfernen" })
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Bild entfernt.")
    );
    const fd = action.mock.calls[0]![1];
    expect(fd.get("productId")).toBe("3");
    expect(fd.get("mediaId")).toBe("7");
  });

  it("shows a form error and no toast", async () => {
    open(result({ status: "error", formError: "Entfernen fehlgeschlagen." }));
    fireEvent.click(
      screen.getByRole("button", { name: "Endgültig entfernen" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entfernen fehlgeschlagen."
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not submit when cancelled", () => {
    const action = result({ status: "saved" });
    open(action);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(action).not.toHaveBeenCalled();
  });
});

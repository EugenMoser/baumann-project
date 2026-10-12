// components/admin/upload-form.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/admin/form";
import type { UploadValues } from "@/lib/admin/media-schema";
import { MAX_IMAGE_BYTES } from "@/lib/admin/image-check";
import { UploadForm } from "./upload-form";

describe("UploadForm (SC-5)", () => {
  it("rejects a file over 5 MB before submitting", () => {
    const action = vi.fn(async (prev: FormState<UploadValues>) => prev);
    render(<UploadForm productId={1} action={action} />);
    const input = screen.getByLabelText("Bilddatei");
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [big] } });
    expect(
      screen.getByText("Das Bild ist größer als 5 MB.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bild hochladen" })
    ).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
});

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const rejecting = (fieldErrors: Record<string, string>, formError = null) =>
  vi.fn(
    async (
      prev: FormState<UploadValues>
    ): Promise<FormState<UploadValues>> => ({
      ...prev,
      status: "error",
      fieldErrors,
      formError,
    })
  );

describe("UploadForm error display", () => {
  it("shows server field errors with aria wiring", async () => {
    const action = rejecting({
      file: "Das Format wird nicht unterstützt.",
      altText: "Bitte einen Alt-Text eingeben.",
    });
    render(<UploadForm productId={1} action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Bild hochladen" }));
    expect(
      await screen.findByText("Das Format wird nicht unterstützt.")
    ).toBeInTheDocument();
    const file = screen.getByLabelText("Bilddatei");
    expect(file).toHaveAttribute("aria-invalid", "true");
    expect(file.getAttribute("aria-describedby")).toContain(
      "upload-file-error"
    );
    const alt = screen.getByLabelText("Alt-Text");
    expect(alt).toHaveAttribute("aria-invalid", "true");
    expect(alt).toHaveAttribute("aria-describedby", "upload-alt-error");
    expect(
      screen.getByText("Bitte einen Alt-Text eingeben.")
    ).toBeInTheDocument();
  });

  it("shows a form error as alert", async () => {
    const action = rejecting({}, "Speichern fehlgeschlagen." as never);
    render(<UploadForm productId={1} action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Bild hochladen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen."
    );
  });

  it("clears a stale server file error when another file is chosen", async () => {
    const action = rejecting({ file: "Das Format wird nicht unterstützt." });
    render(<UploadForm productId={1} action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Bild hochladen" }));
    await screen.findByText("Das Format wird nicht unterstützt.");
    const ok = new File([new Uint8Array(10)], "ok.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Bilddatei"), {
      target: { files: [ok] },
    });
    expect(screen.queryByText("Das Format wird nicht unterstützt.")).toBeNull();
    expect(screen.getByLabelText("Bilddatei")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
  });
});

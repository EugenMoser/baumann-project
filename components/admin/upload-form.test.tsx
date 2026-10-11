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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccessoryValues } from "@/lib/admin/accessory-schema";
import type { FormState } from "@/lib/admin/form";
import { AccessorySection } from "./accessory-section";

const noopAction = async <S,>(prev: S) => prev;

describe("AccessorySection (SC-9)", () => {
  it("adds, moves and removes rows", () => {
    render(
      <AccessorySection
        productId={3}
        items={[
          {
            articleNumber: "99010",
            articleName: "Testkeil 8 mm",
            productName: "Testkeil",
          },
        ]}
        action={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Zubehör hinzufügen" }));
    const inputs = () =>
      screen.getAllByLabelText("Artikelnummer") as HTMLInputElement[];
    fireEvent.change(inputs()[1]!, { target: { value: "99211/80" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 2 nach oben" })
    );
    expect(inputs().map((i) => i.value)).toEqual(["99211/80", "99010"]);
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 1 entfernen" })
    );
    expect(inputs().map((i) => i.value)).toEqual(["99010"]);
    expect(screen.getByText(/Testkeil 8 mm/)).toBeInTheDocument();
  });
});

describe("AccessorySection submission", () => {
  it("submits trimmed-as-typed numbers in row order after edits", async () => {
    let submitted: string[] = [];
    const action = vi.fn(
      async (
        prev: FormState<AccessoryValues>,
        formData: FormData
      ): Promise<FormState<AccessoryValues>> => {
        submitted = formData.getAll("articleNumber").map(String);
        return prev;
      }
    );
    render(
      <AccessorySection
        productId={3}
        items={[
          { articleNumber: "A", articleName: null, productName: "P" },
          { articleNumber: "B", articleName: null, productName: "P" },
        ]}
        action={action}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Zubehör hinzufügen" }));
    fireEvent.change(screen.getAllByLabelText("Artikelnummer")[2]!, {
      target: { value: " C " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 1 entfernen" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 2 nach oben" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Zubehör speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(submitted).toEqual([" C ", "B"]);
  });

  it("shows row and form errors with aria wiring", async () => {
    const action = vi.fn(
      async (
        prev: FormState<AccessoryValues>
      ): Promise<FormState<AccessoryValues>> => ({
        ...prev,
        status: "error",
        fieldErrors: {
          "rows.1.articleNumber": "Diese Artikelnummer gibt es nicht.",
        },
        formError: "Speichern fehlgeschlagen.",
      })
    );
    render(
      <AccessorySection
        productId={3}
        items={[
          { articleNumber: "A", articleName: null, productName: "P" },
          { articleNumber: "nope", articleName: null, productName: "P" },
        ]}
        action={action}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Zubehör speichern" }));
    expect(
      await screen.findByText("Diese Artikelnummer gibt es nicht.")
    ).toBeInTheDocument();
    const inputs = screen.getAllByLabelText("Artikelnummer");
    expect(inputs[0]).toHaveAttribute("aria-invalid", "false");
    expect(inputs[1]).toHaveAttribute("aria-invalid", "true");
    expect(inputs[1]).toHaveAttribute(
      "aria-describedby",
      "accessory-1-hint accessory-1-error"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen."
    );
  });

  it("disables move buttons at the ends", () => {
    render(
      <AccessorySection
        productId={3}
        items={[
          { articleNumber: "A", articleName: null, productName: "P" },
          { articleNumber: "B", articleName: null, productName: "P" },
        ]}
        action={noopAction}
      />
    );
    expect(
      screen.getByRole("button", { name: "Zubehör 1 nach oben" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Zubehör 2 nach unten" })
    ).toBeDisabled();
  });
});

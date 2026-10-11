// components/admin/category-form.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  emptyCategoryValues,
  type CategoryValues,
} from "@/lib/admin/category-schema";
import type { FormState } from "@/lib/admin/form";
import { CategoryForm } from "./category-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const attributes = [
  {
    id: 1,
    key: "height",
    label: "Höhe",
    unit: "mm",
    dataType: "decimal" as const,
    sortOrder: 0,
  },
  {
    id: 3,
    key: "surface",
    label: "Oberfläche",
    unit: null,
    dataType: "text" as const,
    sortOrder: 2,
  },
];

const noop = async <S,>(s: S) => s;

describe("CategoryForm (SC-10)", () => {
  it("renders one checkbox per attribute with the assigned ones checked", () => {
    render(
      <CategoryForm
        action={noop}
        initial={{
          ...emptyCategoryValues(),
          name: "X",
          slug: "x",
          attributes: [{ attributeId: "3", sortOrder: "0" }],
        }}
        attributes={attributes}
        categoryId={5}
      />
    );
    expect(
      screen.getByRole("checkbox", { name: "Höhe (mm)" })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Oberfläche" })).toBeChecked();
    expect(
      screen.getByText(/ändert die URLs der Kategorie und aller ihrer Produkte/)
    ).toBeInTheDocument();
  });
});

describe("CategoryForm errors (SC-10)", () => {
  type Action = (
    prev: FormState<CategoryValues>,
    formData: FormData
  ) => Promise<FormState<CategoryValues>>;
  const errorAction = (
    fieldErrors: Record<string, string>,
    formError: string | null
  ) =>
    vi.fn<Action>(async (prev) => ({
      ...prev,
      status: "error",
      fieldErrors,
      formError,
    }));
  const renderForm = (action: Action) =>
    render(
      <CategoryForm
        action={action}
        initial={{ ...emptyCategoryValues(), name: "X", slug: "x" }}
        attributes={attributes}
        categoryId={null}
      />
    );

  it("shows the slug conflict on the slug field", async () => {
    renderForm(errorAction({ slug: "Dieser Slug ist schon vergeben." }, null));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));
    const slug = screen.getByLabelText("Slug");
    await waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"));
    expect(slug).toHaveAttribute("aria-describedby", "slug-error");
    expect(screen.getByText("Dieser Slug ist schon vergeben.")).toHaveAttribute(
      "id",
      "slug-error"
    );
  });

  it("shows a field error on the name field", async () => {
    renderForm(errorAction({ name: "Bitte einen Namen eingeben." }, null));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));
    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(name).toHaveAttribute("aria-describedby", "name-error");
    expect(screen.getByText("Bitte einen Namen eingeben.")).toHaveAttribute(
      "id",
      "name-error"
    );
  });

  it("shows the form error as an alert", async () => {
    renderForm(errorAction({}, "Speichern fehlgeschlagen."));
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen."
    );
  });

  it("shows a tampered attribute selection as an alert", async () => {
    renderForm(
      errorAction({ "attributes.0.attributeId": "Ungültige Auswahl." }, null)
    );
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ungültige Auswahl."
    );
  });

  it("submits the checked attributes with their sort order", async () => {
    const action = vi.fn<Action>(async (prev) => prev);
    renderForm(action);
    fireEvent.click(screen.getByRole("checkbox", { name: "Oberfläche" }));
    fireEvent.change(screen.getByLabelText("Reihenfolge Oberfläche"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kategorie anlegen" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls[0]?.[1];
    expect(fd?.getAll("attributeId")).toEqual(["3"]);
    expect(fd?.get("attrSort-3")).toBe("4");
    expect(fd?.get("name")).toBe("X");
  });
});

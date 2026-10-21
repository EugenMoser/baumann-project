import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyProductValues } from "@/lib/admin/schemas";
import { ProductForm } from "./product-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const options = {
  categories: [{ id: 1, name: "Möbelteile" }],
  materials: [{ id: 1, code: "PA-6", name: "Polyamid 6" }],
  colors: [],
  attributes: [],
};
const noop = async <S,>(s: S) => s;

describe("ProductForm (SC-6, SC-12)", () => {
  it("fills the slug from the name on create until the slug is edited", () => {
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
      />
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Schließkeil 8 mm" },
    });
    expect(screen.getByLabelText("Slug")).toHaveValue("schliesskeil-8-mm");
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "eigener-slug" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Anders" },
    });
    expect(screen.getByLabelText("Slug")).toHaveValue("eigener-slug");
  });
  it("shows the URL hint and no delete button for a published product", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
      status: "published",
    };
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="published"
      />
    );
    expect(
      screen.getByText(/ändert die öffentliche Adresse/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Produkt löschen" })
    ).toBeNull();
  });
  it("shows the status returned by the action (selects follow state.values)", async () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
    };
    const action = vi.fn(async () => ({
      status: "saved" as const,
      values: { ...initial, status: "archived" },
      fieldErrors: {},
      formError: null,
    }));
    render(
      <ProductForm
        action={action}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="draft"
      />
    );
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText("Status")).toHaveValue("archived")
    );
    expect(screen.getByLabelText("Kategorie")).toHaveValue("1");
  });
  it("offers delete for a draft", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
    };
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="draft"
      />
    );
    expect(
      screen.getByRole("button", { name: "Produkt löschen" })
    ).toBeInTheDocument();
  });
  it("offers only the draft status and a hint when creating", () => {
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
      />
    );
    const select = screen.getByLabelText("Status");
    const values = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["draft"]);
    const hint = screen.getByText(
      "Artikel, Farben und Bilder folgen nach dem ersten Speichern."
    );
    expect(hint.id).not.toBe("");
    expect(select.getAttribute("aria-describedby") ?? "").toContain(hint.id);
  });
  it("offers all three statuses when editing", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
      slug: "x",
      categoryId: "1",
    };
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="draft"
      />
    );
    const values = within(screen.getByLabelText("Status"))
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["draft", "published", "archived"]);
    expect(
      screen.queryByText(
        "Artikel, Farben und Bilder folgen nach dem ersten Speichern."
      )
    ).toBeNull();
  });
});

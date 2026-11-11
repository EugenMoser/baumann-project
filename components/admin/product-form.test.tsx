import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_SUGGESTION_EXPIRED } from "@/lib/admin/errors";
import type { FormState } from "@/lib/admin/form";
import { emptyProductValues, type ProductValues } from "@/lib/admin/schemas";
import type { ContentOrigin } from "@/lib/catalog/types";
import { ProductForm } from "./product-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const options = {
  categories: [{ id: 1, name: "Möbelteile" }],
  materials: [{ id: 1, code: "PA-6", name: "Polyamid 6" }],
  colors: [],
  attributes: [],
};
const human = { description: "human", seo: "human" } as const;
const noop = async <S,>(s: S) => s;

describe("ProductForm (SC-6, SC-12)", () => {
  it("renders no slug input and shows the create hint (6c SC-2)", () => {
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
        address={null}
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    expect(document.querySelector('input[name="slug"]')).toBeNull();
    expect(
      screen.getByText("Die Adresse entsteht beim Anlegen aus dem Namen.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Adresse:/)).toBeNull();
  });
  it("shows the address line and the category hint on edit (6c SC-2)", () => {
    const initial = {
      ...emptyProductValues(),
      name: "Testkeil mit Dämpfung",
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
        address="/produkte/moebelteile/testkeil-mit-daempfung"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    expect(document.querySelector('input[name="slug"]')).toBeNull();
    expect(
      screen.getByText("Adresse: /produkte/moebelteile/testkeil-mit-daempfung")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Eine Änderung der Kategorie ändert die Adresse.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Die Adresse entsteht beim Anlegen aus dem Namen.")
    ).toBeNull();
  });
  it("shows no delete button for a published product", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
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
        address="/produkte/moebelteile/x"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Produkt löschen" })
    ).toBeNull();
  });
  it("shows the status returned by the action (selects follow state.values)", async () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
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
        address="/produkte/moebelteile/x"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
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
        address="/produkte/moebelteile/x"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
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
        address={null}
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    const select = screen.getByLabelText("Status");
    const values = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["draft"]);
    const hint = screen.getByText(
      "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten Speichern."
    );
    expect(hint.id).not.toBe("");
    expect(select.getAttribute("aria-describedby") ?? "").toContain(hint.id);
  });
  it("offers all three statuses when editing", () => {
    const initial = {
      ...emptyProductValues(),
      name: "X",
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
        address="/produkte/moebelteile/x"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    const values = within(screen.getByLabelText("Status"))
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["draft", "published", "archived"]);
    expect(
      screen.queryByText(
        "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten Speichern."
      )
    ).toBeNull();
  });
  it("shows the automatic SEO preview and follows name and subtitle (6c SC-3)", () => {
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
        address={null}
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    const title = screen.getByLabelText("Titel für Suchmaschinen");
    const description = screen.getByLabelText("Beschreibung für Suchmaschinen");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Neuer Name" },
    });
    expect(title).toHaveAttribute("placeholder", "Neuer Name");
    expect(description).toHaveAttribute("placeholder", "Neuer Name.");
    fireEvent.change(screen.getByLabelText("Untertitel"), {
      target: { value: "Klein" },
    });
    expect(description).toHaveAttribute("placeholder", "Neuer Name – Klein.");
  });
});

describe("ProductForm AI assistant (SC-1, SC-5)", () => {
  const initial: ProductValues = {
    ...emptyProductValues(),
    name: "Testkeil",
    categoryId: "1",
  };
  const suggestions = {
    model: "test-model",
    suggestions: [
      { field: "description", generationId: 11, text: "KI-Beschreibung" },
      { field: "seo_title", generationId: 12, text: "KI-Titel" },
      { field: "seo_description", generationId: 13, text: "KI-SEO-Text" },
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderEditor(
    props: {
      action?: (
        prev: FormState<ProductValues>,
        formData: FormData
      ) => Promise<FormState<ProductValues>>;
      availability?: "none" | "free_only" | "full";
      origins?: { description: ContentOrigin; seo: ContentOrigin };
    } = {}
  ) {
    return render(
      <ProductForm
        action={props.action ?? noop}
        deleteAction={noop}
        initial={initial}
        options={options}
        productId={7}
        savedStatus="draft"
        address="/produkte/moebelteile/testkeil"
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={{ availability: props.availability ?? "full", status: "draft" }}
        origins={props.origins ?? human}
      />
    );
  }

  async function generate(body: typeof suggestions = suggestions) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await screen.findAllByRole("group", { name: /^KI-Vorschlag/ });
  }

  const hiddenId = (name: string) =>
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const boxes = () => screen.queryAllByRole("group", { name: /^KI-Vorschlag/ });

  it("renders the button and hint for a saved product, nothing on create", () => {
    const { unmount } = renderEditor();
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Grundlage ist der zuletzt gespeicherte Stand. Vorschläge werden erst mit „Speichern“ übernommen."
      )
    ).toBeInTheDocument();
    unmount();
    render(
      <ProductForm
        action={noop}
        deleteAction={noop}
        initial={emptyProductValues()}
        options={options}
        productId={null}
        savedStatus={null}
        address={null}
        seoContext={{ articleNumbers: [], colorCount: 0 }}
        ai={null}
        origins={human}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeNull();
    expect(
      screen.getByText(
        "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten Speichern."
      )
    ).toBeInTheDocument();
  });

  it("disables the button when the assistant is not set up", () => {
    renderEditor({ availability: "none" });
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeDisabled();
    expect(
      screen.getByText("Der KI-Assistent ist nicht eingerichtet.")
    ).toBeInTheDocument();
  });

  it("shows three boxes and opens the SEO section", async () => {
    renderEditor();
    expect(document.querySelector("details")?.open).toBe(false);
    await generate();
    expect(boxes()).toHaveLength(3);
    expect(screen.getByText("KI-Beschreibung")).toBeInTheDocument();
    expect(screen.getByText("KI-Titel")).toBeInTheDocument();
    expect(screen.getByText("KI-SEO-Text")).toBeInTheDocument();
    expect(document.querySelector("details")?.open).toBe(true);
  });

  it("names each box after its field", async () => {
    renderEditor();
    await generate();
    for (const name of [
      "KI-Vorschlag: Beschreibung",
      "KI-Vorschlag: Titel für Suchmaschinen",
      "KI-Vorschlag: Beschreibung für Suchmaschinen",
    ])
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
  });

  it("moves focus to the first box after the result when focus was lost", async () => {
    renderEditor();
    await generate();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Übernehmen" })[0]
      ).toHaveFocus()
    );
  });

  it("leaves focus alone when the admin moved on to another field", async () => {
    renderEditor();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        screen.getByLabelText("Name").focus();
        return new Response(JSON.stringify(suggestions), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await screen.findAllByRole("group", { name: /^KI-Vorschlag/ });
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("reopens the SEO section for every new set of boxes after the user closed it", async () => {
    renderEditor();
    const seo = () => document.querySelector("details") as HTMLDetailsElement;
    // Closes the section like a user would; jsdom fires the toggle event.
    const closeSeo = () =>
      act(async () => {
        seo().open = false;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    fireEvent.change(screen.getByLabelText("Titel für Suchmaschinen"), {
      target: { value: "Eigener Titel" },
    });
    expect(seo().open).toBe(true);
    await closeSeo();
    expect(seo().open).toBe(false);
    await generate();
    expect(seo().open).toBe(true);

    await closeSeo();
    await generate({
      ...suggestions,
      suggestions: suggestions.suggestions.map((s, i) => ({
        ...s,
        generationId: 21 + i,
      })),
    });
    await waitFor(() => expect(seo().open).toBe(true));
  });

  it("a new result replaces open boxes", async () => {
    renderEditor();
    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Verwerfen" })[0]);
    expect(boxes()).toHaveLength(2);
    await generate();
    expect(boxes()).toHaveLength(3);
  });

  it("accepting fills the field, sets the hidden id and focuses the field", async () => {
    renderEditor();
    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    const field = screen.getByLabelText("Beschreibung (Markdown)");
    expect(field).toHaveValue("KI-Beschreibung");
    expect(field).toHaveFocus();
    expect(hiddenId("aiDescription")).toHaveValue("11");
    expect(boxes()).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    const title = screen.getByLabelText("Titel für Suchmaschinen");
    expect(title).toHaveValue("KI-Titel");
    expect(title).toHaveFocus();
    expect(hiddenId("aiSeoTitle")).toHaveValue("12");

    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(screen.getByLabelText("Beschreibung für Suchmaschinen")).toHaveValue(
      "KI-SEO-Text"
    );
    expect(hiddenId("aiSeoDescription")).toHaveValue("13");
    expect(boxes()).toHaveLength(0);
  });

  it("discarding leaves the field and moves focus to the next box, then the button", async () => {
    renderEditor();
    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Verwerfen" })[0]);
    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue("");
    expect(hiddenId("aiDescription")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Übernehmen" })[0]
    ).toHaveFocus();
    fireEvent.click(screen.getAllByRole("button", { name: "Verwerfen" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(boxes()).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toHaveFocus();
  });

  it("keeps values and hidden ids after a save with errors, clears them after a save", async () => {
    let call = 0;
    const action = vi.fn(
      async (
        _prev: FormState<ProductValues>,
        formData: FormData
      ): Promise<FormState<ProductValues>> => {
        call += 1;
        const values = {
          ...initial,
          description: String(formData.get("description")),
        };
        return call === 1
          ? {
              status: "error",
              values,
              fieldErrors: { name: "Pflichtfeld." },
              formError: null,
            }
          : { status: "saved", values, fieldErrors: {}, formError: null };
      }
    );
    renderEditor({ action });
    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0][1] as FormData).get("aiDescription")).toBe(
      "11"
    );
    await screen.findByText("Pflichtfeld.");
    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
      "KI-Beschreibung"
    );
    expect(hiddenId("aiDescription")).toHaveValue("11");

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect((action.mock.calls[1][1] as FormData).get("aiDescription")).toBe(
      "11"
    );
    await waitFor(() => expect(hiddenId("aiDescription")).toBeNull());
    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
      "KI-Beschreibung"
    );
  });

  it("resets accepted fields to their saved text after the expired-suggestion error", async () => {
    const action = vi.fn(
      async (
        _prev: FormState<ProductValues>,
        formData: FormData
      ): Promise<FormState<ProductValues>> => ({
        status: "error",
        values: {
          ...initial,
          name: String(formData.get("name")),
          description: String(formData.get("description")),
          seoTitle: String(formData.get("seoTitle")),
          seoDescription: String(formData.get("seoDescription")),
        },
        fieldErrors: {},
        formError: AI_SUGGESTION_EXPIRED,
      })
    );
    renderEditor({ action });
    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Geänderter Name" },
    });
    // A field without an accepted id keeps its edit through the reset.
    fireEvent.change(screen.getByLabelText("Beschreibung für Suchmaschinen"), {
      target: { value: "Eigener SEO-Text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText(AI_SUGGESTION_EXPIRED);
    expect((action.mock.calls[0][1] as FormData).get("aiDescription")).toBe(
      "11"
    );

    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
      initial.description
    );
    expect(screen.getByLabelText("Titel für Suchmaschinen")).toHaveValue(
      initial.seoTitle
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Geänderter Name");
    expect(screen.getByLabelText("Beschreibung für Suchmaschinen")).toHaveValue(
      "Eigener SEO-Text"
    );
    expect(hiddenId("aiDescription")).toBeNull();
    expect(hiddenId("aiSeoTitle")).toBeNull();

    // A second save sends the saved text and no generation id.
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const second = action.mock.calls[1][1] as FormData;
    expect(second.get("description")).toBe(initial.description);
    expect(second.get("aiDescription")).toBeNull();
    expect(second.get("aiSeoTitle")).toBeNull();

    // A new suggestion can still be requested and accepted.
    await generate({
      model: "test-model",
      suggestions: [
        { field: "description", generationId: 21, text: "Neue Beschreibung" },
        { field: "seo_title", generationId: 22, text: "Neuer Titel" },
        { field: "seo_description", generationId: 23, text: "Neuer SEO-Text" },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText("Neue Beschreibung")).toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    expect(hiddenId("aiDescription")).toHaveValue("21");
  });

  it("falls back to the last saved text, not the loaded one, after the expired-suggestion error", async () => {
    let call = 0;
    const action = vi.fn(
      async (
        _prev: FormState<ProductValues>,
        formData: FormData
      ): Promise<FormState<ProductValues>> => {
        call += 1;
        const values = {
          ...initial,
          description: String(formData.get("description")),
        };
        return call === 1
          ? { status: "saved", values, fieldErrors: {}, formError: null }
          : {
              status: "error",
              values,
              fieldErrors: {},
              formError: AI_SUGGESTION_EXPIRED,
            };
      }
    );
    renderEditor({ action });
    fireEvent.change(screen.getByLabelText("Beschreibung (Markdown)"), {
      target: { value: "Erster Text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
        "Erster Text"
      )
    );

    await generate();
    fireEvent.click(screen.getAllByRole("button", { name: "Übernehmen" })[0]);
    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
      "KI-Beschreibung"
    );
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText(AI_SUGGESTION_EXPIRED);
    expect(screen.getByLabelText("Beschreibung (Markdown)")).toHaveValue(
      "Erster Text"
    );
    expect(hiddenId("aiDescription")).toBeNull();
  });

  it("shows the origin badges with the public wording, none for human", () => {
    const { unmount } = renderEditor({
      origins: { description: "ai", seo: "ai_edited" },
    });
    expect(screen.getByText("KI-generiert")).toBeInTheDocument();
    expect(
      screen.getByText("KI-unterstützt, redaktionell bearbeitet")
    ).toBeInTheDocument();
    unmount();
    renderEditor();
    expect(screen.queryByText("KI-generiert")).toBeNull();
    expect(
      screen.queryByText("KI-unterstützt, redaktionell bearbeitet")
    ).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyInquiryValues } from "@/lib/inquiry/schema";
import { initialInquiryState, type InquiryState } from "@/lib/inquiry/submit";
import { InquiryForm } from "./inquiry-form";

const PROPS = {
  privacyUrl: "https://dev.example/datenschutz",
  officialSiteUrl: "https://example.com",
};

describe("InquiryForm (FR-8, FR-11)", () => {
  it("prefills the order number and shows the product link", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState("99010 - 1")}
        prefill={{
          kind: "found",
          match: {
            orderNumber: "99010 - 1",
            productName: "Testkeil mit Dämpfung",
            categorySlug: "moebelteile",
            productSlug: "testkeil-mit-daempfung",
          },
        }}
      />
    );
    expect(screen.getByLabelText(/Bestellnummer/)).toHaveValue("99010 - 1");
    expect(
      screen.getByRole("link", { name: "Testkeil mit Dämpfung" })
    ).toHaveAttribute("href", "/produkte/moebelteile/testkeil-mit-daempfung");
  });

  it("shows a hint for an unknown prefilled number", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState("00000")}
        prefill={{ kind: "unknown" }}
      />
    );
    expect(screen.getByText(/nicht im Katalog/)).toBeVisible();
  });

  it("validates in the browser with the shared schema and does not call the action", async () => {
    const action = vi.fn(async (s: InquiryState) => s);
    render(
      <InquiryForm
        {...PROPS}
        action={action}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    fireEvent.change(screen.getByLabelText(/E-Mail/), {
      target: { value: "kaputt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Anfrage prüfen/ }));
    expect(await screen.findByText(/gültige E-Mail-Adresse/)).toBeVisible();
    expect(screen.getByLabelText(/E-Mail/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("links the privacy policy in the consent label", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    expect(
      screen.getByRole("link", { name: /Datenschutzhinweise/ })
    ).toHaveAttribute("href", PROPS.privacyUrl);
  });

  it("replaces the form with the result panel after a discarded submit", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={{
          status: "discarded",
          orderNumber: "99010 - 1",
          productName: "Testkeil mit Dämpfung",
          quantity: 500,
        }}
        prefill={{ kind: "none" }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(/nicht versendet/);
    expect(screen.getByRole("status")).toHaveTextContent("99010 - 1");
    expect(
      screen.getByRole("link", { name: /offizielle Website/ })
    ).toHaveAttribute("href", PROPS.officialSiteUrl);
    expect(screen.queryByRole("button", { name: /Anfrage prüfen/ })).toBeNull();
  });

  it("focuses the first invalid field after a failed client validation", async () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    fireEvent.change(screen.getByLabelText(/E-Mail/), {
      target: { value: "kaputt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Anfrage prüfen/ }));
    await screen.findByText(/gültige E-Mail-Adresse/);
    const firstInvalid = document.querySelector('[aria-invalid="true"]');
    expect(firstInvalid).not.toBeNull();
    expect(document.activeElement).toBe(firstInvalid);
  });

  it("focuses the first invalid field after a server-side error", async () => {
    const action = vi.fn(async (s: InquiryState): Promise<InquiryState> => {
      if (s.status !== "editing") return s;
      return {
        ...s,
        fieldErrors: {
          orderNumber: "Diese Bestellnummer ist nicht im Katalog.",
        },
      };
    });
    render(
      <InquiryForm
        {...PROPS}
        action={action}
        initialState={initialInquiryState()}
        prefill={{ kind: "none" }}
      />
    );
    fireEvent.change(screen.getByLabelText(/Bestellnummer/), {
      target: { value: "00000" },
    });
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Erika" },
    });
    fireEvent.change(screen.getByLabelText(/E-Mail/), {
      target: { value: "erika@example.com" },
    });
    fireEvent.click(screen.getByLabelText(/Datenschutzhinweise/));
    fireEvent.click(screen.getByRole("button", { name: /Anfrage prüfen/ }));
    await screen.findByText(/nicht im Katalog\./);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(/Bestellnummer/)
      )
    );
  });

  it("focuses the result heading when the submit was discarded", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={{
          status: "discarded",
          orderNumber: null,
          productName: null,
          quantity: null,
        }}
        prefill={{ kind: "none" }}
      />
    );
    expect(document.activeElement).toBe(
      screen.getByText(/Ihre Anfrage ist gültig/)
    );
  });

  it("shows no product link once the order number has an error", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={{
          status: "editing",
          values: emptyInquiryValues("99010 - 1"),
          fieldErrors: { orderNumber: "Fehler" },
          formError: null,
        }}
        prefill={{
          kind: "found",
          match: {
            orderNumber: "99010 - 1",
            productName: "Testkeil mit Dämpfung",
            categorySlug: "moebelteile",
            productSlug: "testkeil-mit-daempfung",
          },
        }}
      />
    );
    expect(
      screen.queryByRole("link", { name: "Testkeil mit Dämpfung" })
    ).toBeNull();
  });

  it("links the prefill hint and the message rule to their fields", () => {
    render(
      <InquiryForm
        {...PROPS}
        action={vi.fn()}
        initialState={initialInquiryState("00000")}
        prefill={{ kind: "unknown" }}
      />
    );
    expect(screen.getByLabelText(/Bestellnummer/)).toHaveAttribute(
      "aria-describedby",
      "anfrage-orderNumber-hinweis"
    );
    expect(screen.getByLabelText(/Nachricht/)).toHaveAccessibleDescription(
      "Bitte geben Sie eine Bestellnummer oder eine Nachricht an."
    );
  });
});

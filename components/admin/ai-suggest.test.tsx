import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERATE_MESSAGES } from "@/lib/ai/messages";
import { AiSuggest, SuggestionBox } from "./ai-suggest";

const HINT =
  "Grundlage ist der zuletzt gespeicherte Stand. Vorschläge werden erst mit „Speichern“ übernommen.";

const okBody = {
  model: "test-model",
  suggestions: [
    { field: "description", generationId: 11, text: "Beschreibung" },
    { field: "seo_title", generationId: 12, text: "Titel" },
    { field: "seo_description", generationId: 13, text: "SEO-Text" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(
  props: Partial<Parameters<typeof AiSuggest>[0]> = {},
  onResult = vi.fn()
) {
  render(
    <AiSuggest
      productId={7}
      availability="full"
      status="draft"
      onResult={onResult}
      {...props}
    />
  );
  return onResult;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiSuggest (SC-5, SC-1)", () => {
  it("shows the button with the hint", () => {
    setup();
    const button = screen.getByRole("button", { name: "Mit KI vorschlagen" });
    expect(button).toBeEnabled();
    const hint = screen.getByText(HINT);
    expect(button.getAttribute("aria-describedby") ?? "").toContain(hint.id);
  });

  it("is disabled with a reason when no tier is set up", () => {
    setup({ availability: "none" });
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeDisabled();
    expect(
      screen.getByText("Der KI-Assistent ist nicht eingerichtet.")
    ).toBeInTheDocument();
  });

  it.each(["draft", "archived"] as const)(
    "is disabled for a %s product when only free models exist",
    (status) => {
      setup({ availability: "free_only", status });
      expect(
        screen.getByRole("button", { name: "Mit KI vorschlagen" })
      ).toBeDisabled();
      expect(
        screen.getByText("Für Entwürfe ist kein Modell eingerichtet.")
      ).toBeInTheDocument();
    }
  );

  it("is enabled for a published product with only free models", () => {
    setup({ availability: "free_only", status: "published" });
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeEnabled();
  });

  it("posts JSON, shows the pending text and announces the result", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    const onResult = setup();
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    const pending = screen.getByRole("button", {
      name: "Vorschlag wird erstellt …",
    });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Vorschlag wird erstellt …"
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/admin/produkte/7/ki-vorschlag");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe("{}");

    resolve(jsonResponse(okBody));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Drei Vorschläge bereit."
      )
    );
    expect(onResult).toHaveBeenCalledWith([
      {
        field: "description",
        generationId: 11,
        text: "Beschreibung",
        model: "test-model",
      },
      {
        field: "seo_title",
        generationId: 12,
        text: "Titel",
        model: "test-model",
      },
      {
        field: "seo_description",
        generationId: 13,
        text: "SEO-Text",
        model: "test-model",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeEnabled();
  });

  it("shows the error text of a 401 answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Bitte neu anmelden." }, 401))
    );
    const onResult = setup();
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Bitte neu anmelden."
      )
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Mit KI vorschlagen" })
    ).toBeEnabled();
  });

  it("falls back to the generic text when the answer is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 502 }))
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        GENERATE_MESSAGES.db_error
      )
    );
  });

  it("falls back to the generic text when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      })
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        GENERATE_MESSAGES.db_error
      )
    );
  });

  it("falls back to the generic text when a 200 answer has the wrong shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ model: "m", suggestions: [] }))
    );
    const onResult = setup();
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        GENERATE_MESSAGES.db_error
      )
    );
    expect(onResult).not.toHaveBeenCalled();
  });

  it("aborts the request on unmount", () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <AiSuggest
        productId={7}
        availability="full"
        status="draft"
        onResult={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mit KI vorschlagen" }));
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("SuggestionBox (SC-5)", () => {
  const suggestion = {
    field: "description" as const,
    generationId: 11,
    text: "Ein Vorschlag",
    model: "test-model",
  };

  it("shows the text, the model name and both buttons", () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();
    render(
      <SuggestionBox
        suggestion={suggestion}
        onAccept={onAccept}
        onDiscard={onDiscard}
      />
    );
    const group = screen.getByRole("group", { name: "KI-Vorschlag" });
    expect(group).toHaveTextContent("Ein Vorschlag");
    expect(group).toHaveTextContent("test-model");
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(onAccept).toHaveBeenCalledWith(suggestion);
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onDiscard).toHaveBeenCalledWith(suggestion);
  });
});

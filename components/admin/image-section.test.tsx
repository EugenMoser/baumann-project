// components/admin/image-section.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type { FormState } from "@/lib/admin/form";
import type { MediaValues } from "@/lib/admin/media-schema";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/admin/media";
import { ImageSection } from "./image-section";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

const item = (id: number, alt: string, thumb: boolean): MediaItem => ({
  mediaId: id,
  storagePath: `products/1/${id}.png`,
  width: 10,
  height: 10,
  altText: alt,
  altOrigin: "human",
  isThumbnail: thumb,
  sortOrder: id,
});
const noop = async <S,>(prev: S) => prev;

function renderSection(items: MediaItem[]) {
  return render(
    <ImageSection
      productId={1}
      items={items}
      saveAction={noop}
      uploadAction={noop}
      removeAction={noop}
    />
  );
}

describe("ImageSection (SC-5)", () => {
  it("moves an image down and keeps the hidden order in sync", () => {
    renderSection([item(1, "Eins", true), item(2, "Zwei", false)]);
    fireEvent.click(screen.getByRole("button", { name: "Bild 1 nach unten" }));
    const ids = screen
      .getAllByTestId("media-id")
      .map((el) => (el as HTMLInputElement).value);
    expect(ids).toEqual(["2", "1"]);
  });

  it("marks exactly one thumbnail", () => {
    renderSection([item(1, "Eins", true), item(2, "Zwei", false)]);
    const radios = screen.getAllByRole("radio", { name: "Vorschaubild" });
    fireEvent.click(radios[1]!);
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(
      1
    );
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
  });

  it("shows an empty state without images", () => {
    renderSection([]);
    expect(screen.getByText("Noch keine Bilder.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Bilder speichern" })
    ).toBeNull();
  });
});

describe("ImageSection error display", () => {
  it("shows row, thumbnail and form errors with aria wiring", async () => {
    const save = vi.fn(
      async (
        prev: FormState<MediaValues>
      ): Promise<FormState<MediaValues>> => ({
        ...prev,
        status: "error",
        fieldErrors: {
          "rows.1.altText": "Bitte einen Alt-Text eingeben.",
          media: "Genau ein Vorschaubild wählen.",
        },
        formError: "Speichern fehlgeschlagen.",
      })
    );
    render(
      <ImageSection
        productId={1}
        items={[item(1, "Eins", true), item(2, "Zwei", false)]}
        saveAction={save}
        uploadAction={noop}
        removeAction={noop}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Bilder speichern" }));
    expect(
      await screen.findByText("Bitte einen Alt-Text eingeben.")
    ).toBeInTheDocument();
    const alts = screen.getAllByLabelText("Alt-Text");
    expect(alts[0]).toHaveAttribute("aria-invalid", "false");
    expect(alts[1]).toHaveAttribute("aria-invalid", "true");
    expect(alts[1]).toHaveAttribute("aria-describedby", "alt-2-error");
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toContain("Genau ein Vorschaubild wählen.");
    expect(alerts).toContain("Speichern fehlgeschlagen.");
  });
});

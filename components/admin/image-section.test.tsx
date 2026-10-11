// components/admin/image-section.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
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

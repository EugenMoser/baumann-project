import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaView } from "@/lib/catalog/types";
import { Gallery } from "./gallery";

function media(n: number, width: number, height: number): MediaView {
  return {
    storagePath: `products/g${n}.webp`,
    width,
    height,
    altText: `Ansicht ${n}`,
    altOrigin: "human",
    role: "gallery",
  };
}

describe("Gallery (4b SC-3)", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  it("(4b SC-3) renders a single image without slider markup", () => {
    const { container } = render(
      <Gallery media={[media(1, 800, 600)]} name="Testkeil" />
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("Abb. 1 · Ansicht 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nächstes Bild" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Produktbilder" })).toBeNull();
  });

  it("(4b SC-3) renders three images with their own sizes in one slider", () => {
    const { container } = render(
      <Gallery
        media={[media(1, 465, 200), media(2, 800, 600), media(3, 465, 200)]}
        name="Testkeil"
      />
    );
    expect(
      screen.getByRole("region", { name: "Produktbilder" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const list = screen
      .getByRole("region", { name: "Produktbilder" })
      .querySelector("ul");
    expect(list).not.toBeNull();
    expect(list).not.toHaveAttribute("role");
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.parentElement).toBe(list);
    }
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`Abb. ${n} · Ansicht ${n}`)).toBeInTheDocument();
    }
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs.map((i) => i.getAttribute("width"))).toEqual([
      "465",
      "800",
      "465",
    ]);
    expect(imgs.map((i) => i.getAttribute("height"))).toEqual([
      "200",
      "600",
      "200",
    ]);
    for (const img of imgs) {
      expect(img.parentElement).toHaveClass("aspect-[2/1]");
    }
  });

  it("(4b SC-3) buttons scroll the track and the indicator follows it", () => {
    render(
      <Gallery
        media={[media(1, 465, 200), media(2, 800, 600), media(3, 465, 200)]}
        name="Testkeil"
      />
    );
    const track = screen.getByRole("region", { name: "Produktbilder" });
    const scrollTo = vi.fn();
    Object.defineProperty(track, "clientWidth", {
      value: 300,
      configurable: true,
    });
    Object.defineProperty(track, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    });
    track.scrollTo = scrollTo;

    expect(
      screen.getByRole("button", { name: "Vorheriges Bild" })
    ).toBeDisabled();
    const next = screen.getByRole("button", { name: "Nächstes Bild" });
    expect(next).toBeEnabled();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    fireEvent.click(next);
    expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: "smooth" });

    track.scrollLeft = 600;
    fireEvent.scroll(track);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nächstes Bild" })
    ).toBeDisabled();
  });

  function stubTrack() {
    const track = screen.getByRole("region", { name: "Produktbilder" });
    Object.defineProperty(track, "clientWidth", {
      value: 300,
      configurable: true,
    });
    Object.defineProperty(track, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    });
    track.scrollTo = vi.fn();
    return track;
  }

  function renderThree() {
    render(
      <Gallery
        media={[media(1, 465, 200), media(2, 800, 600), media(3, 465, 200)]}
        name="Testkeil"
      />
    );
    return stubTrack();
  }

  it("(4b SC-3) moves focus to the other button when the next button reaches the last slide", () => {
    const track = renderThree();
    const prev = screen.getByRole("button", { name: "Vorheriges Bild" });
    const next = screen.getByRole("button", { name: "Nächstes Bild" });
    next.focus();
    expect(next).toHaveFocus();

    fireEvent.click(next);
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    expect(next).toBeEnabled();
    expect(next).toHaveFocus();

    fireEvent.click(next);
    track.scrollLeft = 600;
    fireEvent.scroll(track);
    expect(next).toBeDisabled();
    expect(prev).toBeEnabled();
    expect(prev).toHaveFocus();
  });

  it("(4b SC-3) moves focus to the other button when the previous button reaches the first slide", () => {
    const track = renderThree();
    const prev = screen.getByRole("button", { name: "Vorheriges Bild" });
    const next = screen.getByRole("button", { name: "Nächstes Bild" });
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    prev.focus();
    expect(prev).toHaveFocus();

    fireEvent.click(prev);
    track.scrollLeft = 0;
    fireEvent.scroll(track);
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    expect(next).toHaveFocus();
  });

  it("(4b SC-3) keeps focus on the track when scrolling it reaches an end", () => {
    const track = renderThree();
    track.focus();
    expect(track).toHaveFocus();

    track.scrollLeft = 600;
    fireEvent.scroll(track);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nächstes Bild" })
    ).toBeDisabled();
    expect(track).toHaveFocus();
  });

  it("(4b SC-3) shows the fallback box without images", () => {
    render(<Gallery media={[]} name="Testkeil" />);
    expect(screen.getByText("Kein Bild")).toBeInTheDocument();
  });
});

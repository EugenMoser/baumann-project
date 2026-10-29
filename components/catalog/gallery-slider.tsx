"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const BUTTON =
  "border border-line bg-surface px-3 py-1 text-sm text-ink motion-safe:transition-colors enabled:hover:bg-line disabled:text-muted disabled:opacity-50";

export function GallerySlider({
  total,
  children,
}: {
  total: number;
  children: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const prevButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // Which button was last pressed: a disabled button may drop focus to body.
  const pressed = useRef<"prev" | "next" | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controls render only after hydration
    setMounted(true);
  }, []);

  useEffect(() => {
    // A button that reached its end becomes disabled; hand focus to the other
    // one so keyboard users keep their place (WCAG 2.4.3). Scrolling the track
    // itself never moves focus.
    const active = document.activeElement;
    const was = (button: HTMLButtonElement | null, which: "prev" | "next") =>
      active === button ||
      (active === document.body && pressed.current === which);
    if (index >= total - 1 && was(nextButton.current, "next")) {
      prevButton.current?.focus();
    } else if (index <= 0 && was(prevButton.current, "prev")) {
      nextButton.current?.focus();
    }
  }, [index, total]);

  function onScroll() {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function go(target: number) {
    const el = track.current;
    if (!el) return;
    const smooth = window.matchMedia(
      "(prefers-reduced-motion: no-preference)"
    ).matches;
    el.scrollTo({
      left: target * el.clientWidth,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={track}
        role="region"
        aria-label="Produktbilder"
        tabIndex={0}
        onScroll={onScroll}
        onPointerDown={() => (pressed.current = null)}
        onKeyDown={() => (pressed.current = null)}
        className="snap-x snap-mandatory overflow-x-auto"
      >
        <ul className="flex [&>li]:w-full [&>li]:shrink-0 [&>li]:snap-start">
          {children}
        </ul>
      </div>
      {/* Row height is reserved in the server HTML so mounting causes no shift. */}
      <div className="flex h-9 items-center justify-between">
        {mounted && (
          <>
            <button
              type="button"
              ref={prevButton}
              className={BUTTON}
              disabled={index <= 0}
              onClick={() => {
                pressed.current = "prev";
                go(index - 1);
              }}
            >
              Vorheriges Bild
            </button>
            <span className="font-mono text-xs text-muted">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              ref={nextButton}
              className={BUTTON}
              disabled={index >= total - 1}
              onClick={() => {
                pressed.current = "next";
                go(index + 1);
              }}
            >
              Nächstes Bild
            </button>
          </>
        )}
      </div>
    </div>
  );
}

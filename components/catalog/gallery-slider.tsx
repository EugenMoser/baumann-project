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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controls render only after hydration
    setMounted(true);
  }, []);

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
              className={BUTTON}
              disabled={index <= 0}
              onClick={() => go(index - 1)}
            >
              Vorheriges Bild
            </button>
            <span className="font-mono text-xs text-muted">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              className={BUTTON}
              disabled={index >= total - 1}
              onClick={() => go(index + 1)}
            >
              Nächstes Bild
            </button>
          </>
        )}
      </div>
    </div>
  );
}

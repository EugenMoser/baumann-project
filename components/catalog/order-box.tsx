import type { orderBoxNumbers } from "@/lib/catalog/variants";
import { InquiryLink, SelectedOrderNumber } from "./color-selection";

// D4: order number and inquiry link follow the colour selection; without
// JavaScript the server-rendered default stays.
export function OrderBox({ box }: { box: ReturnType<typeof orderBoxNumbers> }) {
  return (
    <section
      aria-label="Bestellung"
      className="flex flex-col border border-line sm:flex-row"
    >
      {box && (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            Bestell-Nr.
          </span>
          <span className="break-words text-xl font-medium">
            <SelectedOrderNumber
              numbers={box.numbers}
              fallback={box.fallback}
            />
          </span>
        </div>
      )}
      <InquiryLink
        numbers={box?.numbers ?? {}}
        fallback={box?.fallback ?? null}
        className="flex items-center justify-center gap-2 bg-accent-strong px-6 py-3 font-semibold text-white hover:bg-ink motion-safe:transition-colors motion-safe:duration-150"
      >
        Anfrage stellen <span aria-hidden="true">→</span>
      </InquiryLink>
    </section>
  );
}

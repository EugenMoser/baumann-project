"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { ColorOption } from "@/lib/catalog/variants";
import { inquiryPath } from "@/lib/inquiry/path";

type Selection = { selected: string; select: (key: string) => void };

const SelectionContext = createContext<Selection | null>(null);

export function ColorSelectionProvider({
  defaultKey,
  children,
}: {
  defaultKey: string;
  children: ReactNode;
}) {
  const [selected, select] = useState(defaultKey);
  return (
    <SelectionContext value={{ selected, select }}>{children}</SelectionContext>
  );
}

// The order number for the selected colour; outside a provider (or for a
// colour without a number) the server-rendered fallback.
function useSelectedNumber<F extends string | null>(
  numbers: Record<string, string>,
  fallback: F
): string | F {
  const selection = useContext(SelectionContext);
  return (selection && numbers[selection.selected]) ?? fallback;
}

// Without JavaScript the server-rendered default stays visible (spec D6).
export function ColorPicker({ options }: { options: ColorOption[] }) {
  const selection = useContext(SelectionContext);
  const name = useId();
  if (!selection) return null;
  const current = options.find((o) => o.key === selection.selected);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-mono text-xs uppercase tracking-wider text-muted">
        Farbe
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.key}
            className="flex cursor-pointer items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm hover:border-ink motion-safe:transition-colors motion-safe:duration-150 has-[input:checked]:border-ink has-[input:checked]:shadow-[inset_0_0_0_1px] has-[input:checked]:shadow-ink has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={name}
              value={o.key}
              checked={selection.selected === o.key}
              onChange={() => selection.select(o.key)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="size-5 border border-ink/20"
              style={{ backgroundColor: o.hexCode }}
            />
            <span>{o.name}</span>
            {o.suffix !== null && (
              <span className="font-mono text-xs text-muted">-{o.suffix}</span>
            )}
            {o.ralReference && (
              <span className="text-xs text-muted">({o.ralReference})</span>
            )}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {current ? `Bestellnummern für Farbe ${current.name}` : ""}
      </p>
    </fieldset>
  );
}

export function SelectedOrderNumber({
  numbers,
  fallback,
}: {
  numbers: Record<string, string>;
  fallback: string;
}) {
  const value = useSelectedNumber(numbers, fallback);
  return <span className="font-mono">{value}</span>;
}

// D4: the inquiry link carries the order number of the selected colour.
export function InquiryLink({
  numbers,
  fallback,
  className,
  children,
}: {
  numbers: Record<string, string>;
  fallback: string | null;
  className?: string;
  children: ReactNode;
}) {
  const value = useSelectedNumber(numbers, fallback);
  return (
    <Link href={inquiryPath(value)} className={className}>
      {children}
    </Link>
  );
}

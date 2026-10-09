"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { ColorOption } from "@/lib/catalog/variants";

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

// Without JavaScript the server-rendered default stays visible (spec D6).
export function ColorPicker({ options }: { options: ColorOption[] }) {
  const selection = useContext(SelectionContext);
  const name = useId();
  if (!selection) return null;
  const current = options.find((o) => o.key === selection.selected);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Farbe</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.key}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm has-[input:checked]:border-accent has-[input:checked]:bg-surface has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent"
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
              className="size-5 rounded-full border border-line"
              style={{ backgroundColor: o.hexCode }}
            />
            <span>{o.name}</span>
            {o.suffix !== null && (
              <span className="font-mono text-muted">-{o.suffix}</span>
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
  const selection = useContext(SelectionContext);
  const value = (selection && numbers[selection.selected]) ?? fallback;
  return <span className="font-mono">{value}</span>;
}

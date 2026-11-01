"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { articleAnchorId } from "@/lib/catalog/anchors";
import {
  orderNumberFor,
  type ArticleOption,
  type ColorOption,
  type VariantMatrix,
} from "@/lib/catalog/variants";
import { inquiryPath } from "@/lib/inquiry/path";

type Selection = {
  color: string | null;
  article: string | null;
  selectColor: (key: string) => void;
  selectArticle: (articleNumber: string) => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function useSelection(): Selection | null {
  return useContext(SelectionContext);
}

// D4: one article and one colour selection for the selection block and the
// article table. The server renders the first article in the default colour;
// the hash is read only after mount so server and first client render agree.
export function SelectionProvider({
  defaultColor,
  articles,
  children,
}: {
  defaultColor: string | null;
  articles: string[];
  children: ReactNode;
}) {
  const [color, selectColor] = useState(defaultColor);
  const [article, selectArticle] = useState<string | null>(articles[0] ?? null);
  const articlesKey = JSON.stringify(articles);

  useEffect(() => {
    const known = JSON.parse(articlesKey) as string[];
    const fromHash = () => {
      const match = known.find(
        (n) => window.location.hash === `#${articleAnchorId(n)}`
      );
      if (match !== undefined) selectArticle(match);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [articlesKey]);

  return (
    <SelectionContext value={{ color, article, selectColor, selectArticle }}>
      {children}
    </SelectionContext>
  );
}

// Without JavaScript the server-rendered default stays visible (spec D6).
export function ColorPicker({ options }: { options: ColorOption[] }) {
  const selection = useSelection();
  const name = useId();
  if (!selection || options.length === 0) return null;
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
              checked={selection.color === o.key}
              onChange={() => selection.selectColor(o.key)}
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
    </fieldset>
  );
}

// D4: native select; hidden for a single article.
export function ArticleSelect({ options }: { options: ArticleOption[] }) {
  const selection = useSelection();
  const id = useId();
  if (!selection || options.length < 2) return null;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="font-mono text-xs uppercase tracking-wider text-muted"
      >
        Artikel
      </label>
      <select
        id={id}
        value={selection.article ?? ""}
        onChange={(e) => selection.selectArticle(e.target.value)}
        className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors motion-safe:duration-150"
      >
        {options.map((o) => (
          <option key={o.articleNumber} value={o.articleNumber}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Order numbers of one article's colour for the article table; outside a
// provider the server-rendered fallback.
export function SelectedOrderNumber({
  numbers,
  fallback,
}: {
  numbers: Record<string, string>;
  fallback: string;
}) {
  const selection = useSelection();
  const value = (selection?.color && numbers[selection.color]) || fallback;
  return <span className="font-mono">{value}</span>;
}

// D4: the order number and the inquiry link follow the chosen article and
// colour; outside a provider the first article's server default.
export function SelectedResult({
  byArticle,
  label,
}: {
  byArticle: VariantMatrix["byArticle"];
  label: string;
}) {
  const selection = useSelection();
  const number = selection
    ? orderNumberFor(byArticle, selection.article, selection.color)
    : orderNumberFor(byArticle, Object.keys(byArticle)[0] ?? null, null);
  return (
    <>
      {number !== null && (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {label}
          </span>
          <span
            aria-live="polite"
            className="break-words font-mono text-xl font-medium"
          >
            {number}
          </span>
        </div>
      )}
      <Link
        href={inquiryPath(number)}
        className="flex items-center justify-center gap-2 bg-accent-strong px-6 py-3 font-semibold text-white hover:bg-ink motion-safe:transition-colors motion-safe:duration-150"
      >
        Anfrage stellen <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

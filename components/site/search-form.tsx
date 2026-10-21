import { SEARCH_MAX } from "@/lib/catalog/search-query";

type SearchFormProps = {
  defaultValue?: string;
  size?: "compact" | "large";
  id?: string;
  ariaLabel?: string;
};

// Plain GET form: works without JavaScript (spec D3).
export function SearchForm({
  defaultValue,
  size = "compact",
  id = "suche",
  ariaLabel = "Katalogsuche",
}: SearchFormProps) {
  const large = size === "large";
  return (
    <form
      role="search"
      aria-label={ariaLabel}
      action="/suche"
      method="get"
      className="flex w-full max-w-md gap-2"
    >
      <label htmlFor={id} className="sr-only">
        Suche nach Produkt, Artikel- oder Bestellnummer
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={SEARCH_MAX}
        placeholder="Art.-Nr. oder Produkt"
        className={`min-w-0 flex-1 rounded-sm border bg-paper px-3 font-mono placeholder:text-muted ${large ? "border-[1.5px] border-ink py-3 text-base" : "border-muted py-1.5 text-sm"}`}
      />
      <button
        type="submit"
        className={`rounded-sm bg-ink px-4 font-medium text-paper hover:bg-accent-strong motion-safe:transition-colors motion-safe:duration-150 ${large ? "py-3" : "py-1.5 text-sm"}`}
      >
        Suchen
      </button>
    </form>
  );
}

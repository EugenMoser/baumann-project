import type {
  ArticleOption,
  ColorOption,
  VariantMatrix,
} from "@/lib/catalog/variants";
import { ArticleSelect, ColorPicker, SelectedResult } from "./color-selection";

// D4: choose article and colour, see the order number, start the inquiry.
// Without JavaScript the server-rendered default (first article, default
// colour) stays.
export function SelectionBlock({
  articleOptions,
  colorOptions,
  byArticle,
}: {
  articleOptions: ArticleOption[];
  colorOptions: ColorOption[];
  byArticle: VariantMatrix["byArticle"];
}) {
  const hasControls = articleOptions.length > 1 || colorOptions.length > 0;
  return (
    <section
      aria-label="Bestellung"
      className="flex flex-col border border-line"
    >
      {hasControls && (
        <div className="flex flex-col gap-4 border-b border-line px-4 py-4">
          <ArticleSelect options={articleOptions} />
          <ColorPicker options={colorOptions} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row">
        <SelectedResult byArticle={byArticle} label="Bestell-Nr." />
      </div>
    </section>
  );
}

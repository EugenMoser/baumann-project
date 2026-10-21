import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SearchResult } from "@/lib/catalog/types";
import { SearchResults } from "./search-results";

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  categorySlug: "moebelteile",
  productSlug: "testkeil",
  name: "Testkeil",
  subtitle: "für Schlösser",
  matchedNumbers: [],
  matchKind: "text",
  thumbnail: null,
  ...over,
});

describe("SearchResults (D5)", () => {
  it("links the product name to its product page", () => {
    render(<SearchResults results={[result()]} />);
    expect(screen.getByRole("link", { name: /Testkeil/ })).toHaveAttribute(
      "href",
      "/produkte/moebelteile/testkeil"
    );
  });

  it("renders one list item per result", () => {
    render(
      <SearchResults
        results={[result(), result({ productSlug: "griff", name: "Griff" })]}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the subtitle", () => {
    render(<SearchResults results={[result()]} />);
    expect(screen.getByText("für Schlösser")).toBeInTheDocument();
  });

  it("joins matched numbers with a comma", () => {
    render(
      <SearchResults
        results={[result({ matchedNumbers: ["1001", "1002", "1003"] })]}
      />
    );
    expect(screen.getByText("1001, 1002, 1003")).toBeInTheDocument();
  });

  it("shows exactly five matched numbers without an ellipsis", () => {
    render(
      <SearchResults
        results={[result({ matchedNumbers: ["1", "2", "3", "4", "5"] })]}
      />
    );
    expect(screen.getByText("1, 2, 3, 4, 5")).toBeInTheDocument();
  });

  it("shows only the first five matched numbers followed by an ellipsis", () => {
    render(
      <SearchResults
        results={[
          result({ matchedNumbers: ["1", "2", "3", "4", "5", "6", "7"] }),
        ]}
      />
    );
    expect(screen.getByText("1, 2, 3, 4, 5 …")).toBeInTheDocument();
    expect(screen.queryByText(/6/)).not.toBeInTheDocument();
  });

  it("renders the thumbnail image when present", () => {
    render(
      <SearchResults
        results={[
          result({
            thumbnail: {
              storagePath: "p/1.jpg",
              width: 200,
              height: 150,
              altText: "Bild eins",
            },
          }),
        ]}
      />
    );
    expect(screen.getByAltText("Bild eins")).toBeInTheDocument();
  });

  it("renders no list items for an empty result list", () => {
    render(<SearchResults results={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

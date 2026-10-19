import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArticleView } from "@/lib/catalog/types";
import { SpecList } from "./spec-list";

function article(number: string, height: number): ArticleView {
  return {
    articleNumber: number,
    name: null,
    description: null,
    note: null,
    material: null,
    materialNote: null,
    attributes: [{ key: "height", label: "Höhe", unit: "mm", value: height }],
    packaging: [],
  };
}

const articles = [article("99010", 8), article("99011", 10)];

describe("SpecList (D4)", () => {
  it("shows material, attribute summary and variant count", () => {
    render(
      <SpecList
        material={{ code: "PA-6", name: "Polyamid 6" }}
        materialNote={null}
        articles={articles}
      />
    );
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Polyamid 6 (PA-6)")).toBeInTheDocument();
    expect(screen.getByText("Höhe")).toBeInTheDocument();
    expect(screen.getByText("8 / 10 mm")).toBeInTheDocument();
    expect(screen.getByText("2 Varianten")).toBeInTheDocument();
  });

  it("uses the singular for a single article", () => {
    render(
      <SpecList material={null} materialNote={null} articles={[articles[0]]} />
    );
    expect(screen.getByText("1 Variante")).toBeInTheDocument();
  });

  it("joins distinct article materials when the product has none", () => {
    const [a, b] = articles;
    render(
      <SpecList
        material={null}
        materialNote={null}
        articles={[
          { ...a, material: { code: "PA-6", name: "Polyamid 6" } },
          { ...b, material: { code: "POM", name: "Polyoxymethylen" } },
        ]}
      />
    );
    expect(screen.getByText("PA-6 / POM")).toBeInTheDocument();
  });

  it("omits the Material term when no material exists anywhere", () => {
    render(
      <SpecList material={null} materialNote={null} articles={articles} />
    );
    expect(screen.queryByText("Material")).not.toBeInTheDocument();
  });
});

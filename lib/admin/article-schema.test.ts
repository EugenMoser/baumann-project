import { describe, expect, it } from "vitest";
import type { AttributeOption } from "./products";
import {
  attributeInputsFor,
  parseArticle,
  type ArticleValues,
} from "./article-schema";

const types = new Map<number, "decimal" | "text">([
  [1, "decimal"],
  [3, "text"],
]);
const base: ArticleValues = {
  id: "",
  productId: "4",
  articleNumber: " 6211/80 ",
  name: "",
  description: "",
  note: "",
  materialId: "",
  materialNote: "",
  sortOrder: "0",
  attributes: {},
  packaging: [],
};

describe("parseArticle (SC-9)", () => {
  it.each(["8,5", "8.5"])("parses %s as 8.5", (raw) => {
    const r = parseArticle({ ...base, attributes: { "1": raw } }, types);
    expect(r.ok && r.value.attributes).toEqual([
      { attributeId: 1, valueDecimal: 8.5, valueText: null },
    ]);
  });
  it("keeps the article number as typed, only trimmed", () => {
    const r = parseArticle(base, types);
    expect(r.ok && r.value.articleNumber).toBe("6211/80");
  });
  it("drops empty attribute inputs and empty pack rows", () => {
    const r = parseArticle(
      {
        ...base,
        attributes: { "1": " ", "3": "glatt" },
        packaging: [
          { quantity: "", label: "" },
          { quantity: "250", label: "Karton" },
        ],
      },
      types
    );
    expect(r.ok && r.value).toMatchObject({
      attributes: [{ attributeId: 3, valueDecimal: null, valueText: "glatt" }],
      packaging: [{ quantity: 250, label: "Karton" }],
    });
  });
  it.each([
    [
      { articleNumber: "  " },
      "articleNumber",
      "Bitte eine Artikelnummer eingeben.",
    ],
    [
      { attributes: { "1": "acht" } },
      "attr:1",
      "Bitte eine Zahl eingeben, z. B. 8,5.",
    ],
    [{ attributes: { "99": "1" } }, "attr:99", "Unbekanntes Attribut."],
    [
      { packaging: [{ quantity: "0", label: "" }] },
      "packaging.0",
      "Bitte eine positive ganze Zahl eingeben.",
    ],
    [
      { packaging: [{ quantity: "-5", label: "" }] },
      "packaging.0",
      "Bitte eine positive ganze Zahl eingeben.",
    ],
    [
      {
        packaging: [
          { quantity: "250", label: "" },
          { quantity: "250", label: "Karton" },
        ],
      },
      "packaging.1",
      "Diese Menge ist schon erfasst.",
    ],
    [{ attributes: { "1.0": "5" } }, "attr:1.0", "Unbekanntes Attribut."],
  ])("rejects %o", (patch, field, message) => {
    const r = parseArticle({ ...base, ...patch } as ArticleValues, types);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[field]).toBe(message);
  });
});

describe("attributeInputsFor (Review Focus 4)", () => {
  const all: AttributeOption[] = [
    {
      id: 1,
      key: "height",
      label: "Höhe",
      unit: "mm",
      dataType: "decimal",
      sortOrder: 0,
    },
    {
      id: 2,
      key: "pipe_diameter",
      label: "für Rohr Ø",
      unit: "mm",
      dataType: "decimal",
      sortOrder: 1,
    },
    {
      id: 3,
      key: "surface",
      label: "Oberfläche",
      unit: null,
      dataType: "text",
      sortOrder: 2,
    },
  ];
  it("shows the category's attributes plus attributes the article already has", () => {
    const article = {
      id: 1,
      articleNumber: "1",
      name: null,
      description: null,
      note: null,
      materialId: null,
      materialNote: null,
      sortOrder: 0,
      attributes: [{ attributeId: 1, valueDecimal: 8, valueText: null }],
      packaging: [],
    };
    expect(attributeInputsFor([2], article, all).map((a) => a.id)).toEqual([
      1, 2,
    ]);
    expect(attributeInputsFor([3, 1], null, all).map((a) => a.id)).toEqual([
      1, 3,
    ]);
  });
});

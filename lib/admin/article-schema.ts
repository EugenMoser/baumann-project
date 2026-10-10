import { z } from "zod";
import type { FieldErrors } from "./form";
import type { ArticleEditItem, AttributeOption } from "./products";
import { integer, optionalId, optionalText, requiredText } from "./schemas";

export type ArticleValues = {
  id: string;
  productId: string;
  articleNumber: string;
  name: string;
  description: string;
  note: string;
  materialId: string;
  materialNote: string;
  sortOrder: string;
  attributes: Record<string, string>;
  packaging: { quantity: string; label: string }[];
};
export type ArticleInput = {
  id: number | null;
  productId: number;
  articleNumber: string;
  name: string | null;
  description: string | null;
  note: string | null;
  materialId: number | null;
  materialNote: string | null;
  sortOrder: number;
  attributes: {
    attributeId: number;
    valueDecimal: number | null;
    valueText: string | null;
  }[];
  packaging: { quantity: number; label: string | null }[];
};

const DECIMAL = /^\d{1,7}([.,]\d{1,3})?$/;
const QUANTITY = /^[1-9]\d{0,6}$/;

const baseSchema = z.object({
  id: optionalId,
  productId: z
    .string()
    .regex(/^[1-9]\d*$/, "Ungültiges Produkt.")
    .transform(Number),
  articleNumber: requiredText(40, "Bitte eine Artikelnummer eingeben."),
  name: optionalText(200),
  description: optionalText(5_000),
  note: optionalText(500),
  materialId: optionalId,
  materialNote: optionalText(500),
  sortOrder: integer,
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readArticleForm(formData: FormData): ArticleValues {
  const attributes: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attr:") && typeof value === "string")
      attributes[key.slice(5)] = value;
  }
  const quantities = formData.getAll("packQuantity").map(str);
  const labels = formData.getAll("packLabel").map(str);
  return {
    id: str(formData.get("id")),
    productId: str(formData.get("productId")),
    articleNumber: str(formData.get("articleNumber")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    note: str(formData.get("note")),
    materialId: str(formData.get("materialId")),
    materialNote: str(formData.get("materialNote")),
    sortOrder: str(formData.get("sortOrder")) || "0",
    attributes,
    packaging: quantities.map((quantity, i) => ({
      quantity,
      label: labels[i] ?? "",
    })),
  };
}

export function parseArticle(
  values: ArticleValues,
  types: ReadonlyMap<number, "decimal" | "text">
): { ok: true; value: ArticleInput } | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  const base = baseSchema.safeParse(values);
  if (!base.success)
    for (const issue of base.error.issues)
      errors[String(issue.path[0])] ??= issue.message;

  const attributes: ArticleInput["attributes"] = [];
  for (const [key, raw] of Object.entries(values.attributes)) {
    const id = Number(key);
    const type = types.get(id);
    const value = raw.trim();
    if (type === undefined) {
      errors[`attr:${key}`] = "Unbekanntes Attribut.";
      continue;
    }
    if (value === "") continue;
    if (type === "decimal") {
      if (!DECIMAL.test(value)) {
        errors[`attr:${key}`] = "Bitte eine Zahl eingeben, z. B. 8,5.";
        continue;
      }
      attributes.push({
        attributeId: id,
        valueDecimal: Number(value.replace(",", ".")),
        valueText: null,
      });
    } else if (value.length > 200) {
      errors[`attr:${key}`] = "Höchstens 200 Zeichen.";
    } else {
      attributes.push({
        attributeId: id,
        valueDecimal: null,
        valueText: value,
      });
    }
  }

  const packaging: ArticleInput["packaging"] = [];
  values.packaging.forEach((row, i) => {
    const quantity = row.quantity.trim();
    const label = row.label.trim();
    if (quantity === "" && label === "") return;
    if (!QUANTITY.test(quantity)) {
      errors[`packaging.${i}`] = "Bitte eine positive ganze Zahl eingeben.";
      return;
    }
    if (label.length > 50) {
      errors[`packaging.${i}`] = "Bezeichnung höchstens 50 Zeichen.";
      return;
    }
    packaging.push({
      quantity: Number(quantity),
      label: label === "" ? null : label,
    });
  });

  if (!base.success || Object.keys(errors).length > 0)
    return { ok: false, fieldErrors: errors };
  attributes.sort((a, b) => a.attributeId - b.attributeId);
  return { ok: true, value: { ...base.data, attributes, packaging } };
}

export function attributeInputsFor(
  categoryAttributeIds: readonly number[],
  article: ArticleEditItem | null,
  all: readonly AttributeOption[]
): AttributeOption[] {
  const ids = new Set([
    ...categoryAttributeIds,
    ...(article?.attributes.map((a) => a.attributeId) ?? []),
  ]);
  return all
    .filter((a) => ids.has(a.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function articleValuesFrom(
  article: ArticleEditItem | null,
  productId: number
): ArticleValues {
  return {
    id: article ? String(article.id) : "",
    productId: String(productId),
    articleNumber: article?.articleNumber ?? "",
    name: article?.name ?? "",
    description: article?.description ?? "",
    note: article?.note ?? "",
    materialId: article?.materialId != null ? String(article.materialId) : "",
    materialNote: article?.materialNote ?? "",
    sortOrder: String(article?.sortOrder ?? 0),
    attributes: Object.fromEntries(
      (article?.attributes ?? []).map((a) => [
        String(a.attributeId),
        a.valueDecimal !== null
          ? String(a.valueDecimal).replace(".", ",")
          : (a.valueText ?? ""),
      ])
    ),
    packaging: (article?.packaging ?? []).map((p) => ({
      quantity: String(p.quantity),
      label: p.label ?? "",
    })),
  };
}

import { z } from "zod";
import { SLUG_PATTERN, slugify } from "@/lib/catalog/slug";
import { integer, optionalText, requiredText } from "./schemas";

export const CATEGORY_FIELDS = [
  "name",
  "slug",
  "introText",
  "seoTitle",
  "seoDescription",
  "sortOrder",
] as const;
type CategoryField = (typeof CATEGORY_FIELDS)[number];
export type CategoryValues = Record<CategoryField, string> & {
  attributes: { attributeId: string; sortOrder: string }[];
};

export const CATEGORY_CONFLICTS: Record<string, string> = {
  slug: "Dieser Slug ist schon vergeben.",
};

export const emptyCategoryValues = (): CategoryValues => ({
  name: "",
  slug: "",
  introText: "",
  seoTitle: "",
  seoDescription: "",
  sortOrder: "0",
  attributes: [],
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readCategoryForm(formData: FormData): CategoryValues {
  const values = emptyCategoryValues();
  for (const field of CATEGORY_FIELDS) values[field] = str(formData.get(field));
  values.attributes = formData.getAll("attributeId").map((v) => {
    const attributeId = str(v);
    return {
      attributeId,
      sortOrder: str(formData.get(`attrSort-${attributeId}`)) || "0",
    };
  });
  return values;
}

export const categorySchema = z.object({
  name: requiredText(120, "Bitte einen Namen eingeben."),
  slug: z
    .string()
    .trim()
    .max(120, "Höchstens 120 Zeichen.")
    .regex(SLUG_PATTERN, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  introText: z.string().trim().max(10_000, "Höchstens 10000 Zeichen."),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  sortOrder: integer,
  attributes: z
    .array(
      z.object({
        attributeId: z
          .string()
          .regex(/^[1-9]\d{0,9}$/, "Ungültige Auswahl.")
          .transform(Number),
        sortOrder: integer,
      })
    )
    .refine(
      (rows) => new Set(rows.map((r) => r.attributeId)).size === rows.length,
      "Ungültige Auswahl."
    ),
});
export type CategoryInput = z.output<typeof categorySchema>;

export function withDefaultCategorySlug(
  values: CategoryValues
): CategoryValues {
  return values.slug.trim() === ""
    ? { ...values, slug: slugify(values.name) }
    : values;
}

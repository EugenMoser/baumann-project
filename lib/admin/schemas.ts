import { z } from "zod";
import { SLUG_PATTERN, slugify } from "@/lib/catalog/slug";

export const PRODUCT_FIELDS = [
  "categoryId",
  "name",
  "slug",
  "subtitle",
  "description",
  "materialId",
  "materialNote",
  "status",
  "sortOrder",
  "seoTitle",
  "seoDescription",
] as const;
export type ProductValues = Record<(typeof PRODUCT_FIELDS)[number], string>;

export const emptyProductValues = (): ProductValues => ({
  categoryId: "",
  name: "",
  slug: "",
  subtitle: "",
  description: "",
  materialId: "",
  materialNote: "",
  status: "draft",
  sortOrder: "0",
  seoTitle: "",
  seoDescription: "",
});

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === "" ? null : v));
export const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Höchstens ${max} Zeichen.`);
export const optionalId = z
  .string()
  .regex(/^([1-9]\d*)?$/, "Ungültige Auswahl.")
  .transform((v) => (v === "" ? null : Number(v)));
export const integer = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}$/, "Bitte eine ganze Zahl eingeben.")
  .transform(Number);

export const productSchema = z.object({
  categoryId: z
    .string()
    .regex(/^[1-9]\d*$/, "Bitte eine Kategorie wählen.")
    .transform(Number),
  name: requiredText(200, "Bitte einen Namen eingeben."),
  slug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  subtitle: optionalText(200),
  description: optionalText(10_000),
  materialId: optionalId,
  materialNote: optionalText(500),
  status: z.enum(["draft", "published", "archived"], {
    message: "Ungültiger Status.",
  }),
  sortOrder: integer,
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
});
export type ProductInput = z.output<typeof productSchema>;

export function withDefaultSlug(values: ProductValues): ProductValues {
  return values.slug.trim() === ""
    ? { ...values, slug: slugify(values.name) }
    : values;
}

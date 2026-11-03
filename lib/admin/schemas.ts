import { z } from "zod";
import { slugBase } from "@/lib/catalog/slug";

export const PRODUCT_FIELDS = [
  "categoryId",
  "name",
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

// Hidden fields that carry the id of an accepted AI suggestion (D6). They are
// not product values: the form keeps them apart from PRODUCT_FIELDS.
export const AI_ACCEPT_FIELDS = {
  description: "aiDescription",
  seoTitle: "aiSeoTitle",
  seoDescription: "aiSeoDescription",
} as const;

export const emptyProductValues = (): ProductValues => ({
  categoryId: "",
  name: "",
  subtitle: "",
  description: "",
  materialId: "",
  materialNote: "",
  status: "draft",
  sortOrder: "0",
  seoTitle: "",
  seoDescription: "",
});

// The slug is made from the name on the server (6c D1), so the name needs at
// least one letter or digit.
export const NAME_NEEDS_CHARACTER =
  "Der Name braucht mindestens einen Buchstaben oder eine Ziffer.";
export const nameHasSlug = (name: string): boolean => slugBase(name) !== "";

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
  .regex(/^([1-9]\d{0,9})?$/, "Ungültige Auswahl.")
  .transform((v) => (v === "" ? null : Number(v)));
export const integer = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}$/, "Bitte eine ganze Zahl eingeben.")
  .transform(Number);

export const productSchema = z.object({
  categoryId: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, "Bitte eine Kategorie wählen.")
    .transform(Number),
  name: requiredText(200, "Bitte einen Namen eingeben.").refine(
    nameHasSlug,
    NAME_NEEDS_CHARACTER
  ),
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/database.types.ts";
import { numbersIn } from "./checks.ts";

// Input for the model (D2): the saved product state as a German JSON block.

type Material = { code: string; name: string };

export type CopySource = {
  productId: number;
  status: "draft" | "published" | "archived";
  category: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  material: Material | null;
  materialNote: string | null;
  articles: {
    number: string;
    name: string | null;
    description: string | null;
    note: string | null;
    material: Material | null;
    materialNote: string | null;
    attributes: {
      label: string;
      value: string | number;
      unit: string | null;
    }[];
    packaging: { quantity: number; label: string | null }[];
  }[];
  colors: { name: string; isDefault: boolean }[];
};

// Keys are German because the JSON block goes to a German prompt.
export type CopyInput = {
  kategorie: string;
  produkt: string;
  untertitel: string | null;
  material: string | null;
  materialhinweis: string | null;
  anzahlArtikel: number;
  anzahlFarben: number;
  artikel: {
    nummer: string;
    name: string | null;
    beschreibung: string | null;
    hinweis: string | null;
    material: string | null;
    materialhinweis: string | null;
    merkmale: { name: string; wert: string; einheit: string | null }[];
    verpackung: { menge: number; bezeichnung: string | null }[];
  }[];
  farben: { name: string; standard: boolean }[];
  bisherigeBeschreibung: string | null;
};

const PRODUCT_SELECT = `
  id, status, name, subtitle, description, material_note,
  category(name),
  material(code, name),
  article!article_product_id_fkey(
    article_number, name, description, note, material_note, sort_order,
    material(code, name),
    article_attribute(value_decimal, value_text, attribute(label, unit, sort_order)),
    article_packaging(quantity, label, sort_order)
  ),
  product_color(is_default, sort_order, color(name))
`;

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
  a.sort_order - b.sort_order;

export async function loadCopySource(
  client: SupabaseClient<Database>,
  productId: number
): Promise<
  | { ok: true; value: CopySource }
  | { ok: false; error: "not_found" | "db_error" }
> {
  const { data: row, error } = await client
    .from("product")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();
  if (error) return { ok: false, error: "db_error" };
  if (!row) return { ok: false, error: "not_found" };

  return {
    ok: true,
    value: {
      productId: row.id,
      status: row.status,
      category: row.category.name,
      name: row.name,
      subtitle: row.subtitle,
      description: row.description,
      material: row.material,
      materialNote: row.material_note,
      articles: [...row.article].sort(bySortOrder).map((a) => ({
        number: a.article_number,
        name: a.name,
        description: a.description,
        note: a.note,
        material: a.material,
        materialNote: a.material_note,
        attributes: [...a.article_attribute]
          .sort((x, y) => x.attribute.sort_order - y.attribute.sort_order)
          .map((v) => ({
            label: v.attribute.label,
            value: v.value_decimal ?? v.value_text ?? "",
            unit: v.attribute.unit,
          })),
        packaging: [...a.article_packaging]
          .sort(bySortOrder)
          .map(({ quantity, label }) => ({ quantity, label })),
      })),
      colors: [...row.product_color]
        .sort(bySortOrder)
        .map((c) => ({ name: c.color.name, isDefault: c.is_default })),
    },
  };
}

const formatMaterial = (m: Material | null) =>
  m ? `${m.code} – ${m.name}` : null;

// Decimal comma, so the number check sees the same form as the text.
const formatValue = (value: string | number) =>
  typeof value === "number" ? String(value).replace(".", ",") : value;

export function buildCopyInput(source: CopySource): CopyInput {
  const productMaterial = formatMaterial(source.material);
  return {
    kategorie: source.category,
    produkt: source.name,
    untertitel: source.subtitle,
    material: productMaterial,
    materialhinweis: source.materialNote,
    anzahlArtikel: source.articles.length,
    anzahlFarben: source.colors.length,
    artikel: source.articles.map((a) => ({
      nummer: a.number,
      name: a.name,
      beschreibung: a.description,
      hinweis: a.note,
      material: formatMaterial(a.material) ?? productMaterial,
      materialhinweis: a.materialNote,
      merkmale: a.attributes.map((v) => ({
        name: v.label,
        wert: formatValue(v.value),
        einheit: v.unit,
      })),
      verpackung: a.packaging.map((p) => ({
        menge: p.quantity,
        bezeichnung: p.label,
      })),
    })),
    farben: source.colors.map((c) => ({
      name: c.name,
      standard: c.isDefault,
    })),
    bisherigeBeschreibung: source.description?.trim()
      ? source.description
      : null,
  };
}

function collectNumbers(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    for (const n of numbersIn(value)) into.add(n);
  } else if (typeof value === "number") {
    for (const n of numbersIn(String(value))) into.add(n);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
}

// Numbers the model may use: every string and number value of the input,
// through the same normalisation as the output check.
export function inputNumbers(input: CopyInput): Set<string> {
  const numbers = new Set<string>();
  collectNumbers(input, numbers);
  return numbers;
}

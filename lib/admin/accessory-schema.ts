import type { AccessoryItem } from "./accessories";
import type { FieldErrors } from "./form";

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export type AccessoryValues = {
  productId: string;
  rows: { articleNumber: string }[];
};

export function readAccessoryForm(formData: FormData): AccessoryValues {
  return {
    productId: str(formData.get("productId")),
    rows: formData
      .getAll("articleNumber")
      .map((v) => ({ articleNumber: str(v) })),
  };
}

// Numbers keep their original row index so errors land on the visible row.
export function parseAccessories(values: AccessoryValues):
  | {
      ok: true;
      value: { productId: number; numbers: string[]; rows: number[] };
    }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const numbers: string[] = [];
  const rows: number[] = [];
  values.rows.forEach((row, i) => {
    const n = row.articleNumber.trim();
    if (n === "") return;
    if (n.length > 40)
      errors[`rows.${i}.articleNumber`] = "Höchstens 40 Zeichen.";
    else if (numbers.includes(n))
      errors[`rows.${i}.articleNumber`] =
        "Dieser Artikel steht schon in der Liste.";
    else {
      numbers.push(n);
      rows.push(i);
    }
  });
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: { productId: Number(values.productId), numbers, rows },
  };
}

export function unknownNumberErrors(
  numbers: string[],
  resolved: Map<string, number>,
  rows: number[] = numbers.map((_, i) => i)
): FieldErrors {
  const errors: FieldErrors = {};
  numbers.forEach((n, i) => {
    if (!resolved.has(n))
      errors[`rows.${rows[i] ?? i}.articleNumber`] =
        "Diese Artikelnummer gibt es nicht.";
  });
  return errors;
}

export function accessoryValuesFrom(
  productId: number,
  items: AccessoryItem[]
): AccessoryValues {
  return {
    productId: String(productId),
    rows: items.map((a) => ({ articleNumber: a.articleNumber })),
  };
}

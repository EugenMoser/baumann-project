import { DUPLICATE_COLOR, DUPLICATE_SUFFIX, NEEDS_ONE_DEFAULT } from "./errors";
import type { FieldErrors } from "./form";
import type { ColorAssignment } from "./products";

export { DUPLICATE_COLOR, DUPLICATE_SUFFIX, NEEDS_ONE_DEFAULT } from "./errors";

export type ColorValues = {
  productId: string;
  rows: { colorId: string; suffix: string; sortOrder: string }[];
  defaultColorId: string;
};

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readColorsForm(formData: FormData): ColorValues {
  const ids = formData.getAll("colorId").map(str);
  const suffixes = formData.getAll("suffix").map(str);
  const orders = formData.getAll("sortOrder").map(str);
  return {
    productId: str(formData.get("productId")),
    rows: ids.map((colorId, i) => ({
      colorId,
      suffix: suffixes[i] ?? "",
      sortOrder: orders[i] ?? String(i),
    })),
    defaultColorId: str(formData.get("defaultColor")),
  };
}

export function parseColors(
  values: ColorValues
):
  | { ok: true; value: { productId: number; rows: ColorAssignment[] } }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const rows: ColorAssignment[] = [];
  values.rows.forEach((row, i) => {
    const suffix = row.suffix.trim();
    if (!ID.test(row.colorId)) {
      errors[`rows.${i}.colorId`] = "Bitte eine Farbe wählen.";
      return;
    }
    if (suffix.length > 10) {
      errors[`rows.${i}.suffix`] = "Höchstens 10 Zeichen.";
      return;
    }
    if (!/^-?\d{1,6}$/.test(row.sortOrder.trim())) {
      errors[`rows.${i}.sortOrder`] = "Bitte eine ganze Zahl eingeben.";
      return;
    }
    rows.push({
      colorId: Number(row.colorId),
      suffix: suffix === "" ? null : suffix,
      isDefault: row.colorId === values.defaultColorId,
      sortOrder: Number(row.sortOrder.trim()),
    });
  });
  if (Object.keys(errors).length === 0) {
    const colors = rows.map((r) => r.colorId);
    const suffixes = rows.flatMap((r) => (r.suffix === null ? [] : [r.suffix]));
    if (new Set(colors).size !== colors.length) errors.colors = DUPLICATE_COLOR;
    else if (new Set(suffixes).size !== suffixes.length)
      errors.colors = DUPLICATE_SUFFIX;
    else if (rows.length > 0 && rows.filter((r) => r.isDefault).length !== 1)
      errors.colors = NEEDS_ONE_DEFAULT;
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return { ok: true, value: { productId: Number(values.productId), rows } };
}

export function colorValuesFrom(
  productId: number,
  rows: ColorAssignment[]
): ColorValues {
  return {
    productId: String(productId),
    rows: rows.map((r) => ({
      colorId: String(r.colorId),
      suffix: r.suffix ?? "",
      sortOrder: String(r.sortOrder),
    })),
    defaultColorId: String(rows.find((r) => r.isDefault)?.colorId ?? ""),
  };
}

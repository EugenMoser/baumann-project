import { z } from "zod";

export const INQUIRY_FIELDS = [
  "orderNumber",
  "quantity",
  "name",
  "company",
  "email",
  "phone",
  "message",
  "privacy",
] as const;
export type InquiryField = (typeof INQUIRY_FIELDS)[number];
export type InquiryValues = Record<InquiryField, string>;
export type FieldErrors = Partial<Record<InquiryField, string>>;

const maxText = (max: number) =>
  z.string().trim().max(max, `Bitte höchstens ${max} Zeichen eingeben.`);
const orNull = (value: string) => (value === "" ? null : value);
const QUANTITY_MESSAGE = "Bitte eine ganze Zahl von 1 bis 1.000.000 eingeben.";

// Shared by the browser and the Server Action (spec D6). Input: raw form strings.
export const inquirySchema = z
  .object({
    orderNumber: maxText(40),
    quantity: z
      .string()
      .trim()
      .refine(
        (v) =>
          v === "" ||
          (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000),
        QUANTITY_MESSAGE
      ),
    name: z
      .string()
      .trim()
      .min(2, "Bitte geben Sie Ihren Namen an.")
      .max(100, "Bitte höchstens 100 Zeichen eingeben."),
    company: maxText(100),
    email: z
      .string()
      .trim()
      .max(254, "Bitte höchstens 254 Zeichen eingeben.")
      .pipe(z.email("Bitte geben Sie eine gültige E-Mail-Adresse an.")),
    phone: maxText(40).regex(
      /^[\d\s+\-/()]*$/,
      "Bitte nur Ziffern, Leerzeichen und + - / ( ) verwenden."
    ),
    message: maxText(2000),
    privacy: z.literal("on", {
      error:
        "Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.",
    }),
  })
  .refine((v) => v.orderNumber !== "" || v.message !== "", {
    path: ["message"],
    message: "Bitte geben Sie eine Bestellnummer oder eine Nachricht an.",
  })
  .transform((v) => ({
    orderNumber: orNull(v.orderNumber),
    quantity: v.quantity === "" ? null : Number(v.quantity),
    name: v.name,
    company: orNull(v.company),
    email: v.email,
    phone: orNull(v.phone),
    message: orNull(v.message),
  }));

export type Inquiry = z.output<typeof inquirySchema>;

export function emptyInquiryValues(orderNumber = ""): InquiryValues {
  return {
    orderNumber,
    quantity: "",
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
    privacy: "",
  };
}

export function readInquiryForm(formData: FormData): InquiryValues {
  const values = emptyInquiryValues();
  for (const field of INQUIRY_FIELDS) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

// First message per field.
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      typeof field === "string" &&
      (INQUIRY_FIELDS as readonly string[]).includes(field)
    ) {
      const key = field as InquiryField;
      errors[key] ??= issue.message;
    }
  }
  return errors;
}

import type { CatalogError } from "@/lib/catalog/types";
import type { VariantMatch } from "@/lib/catalog/variant-lookup";
import type { Result } from "@/lib/result";
import {
  emptyInquiryValues,
  fieldErrors,
  inquirySchema,
  readInquiryForm,
  type FieldErrors,
  type InquiryValues,
} from "./schema";
import type { InquirySender } from "./sender";

export type InquiryState =
  | {
      status: "editing";
      values: InquiryValues;
      fieldErrors: FieldErrors;
      formError: string | null;
    }
  | {
      status: "discarded";
      orderNumber: string | null;
      productName: string | null;
      quantity: number | null;
    };

export type InquiryDeps = {
  findVariant: (q: string) => Promise<Result<VariantMatch, CatalogError>>;
  sender: InquirySender;
  // Never receives submitted values (spec D6).
  logError: (message: string, detail: string) => void;
};

export const LOOKUP_UNAVAILABLE =
  "Prüfung derzeit nicht möglich. Bitte versuchen Sie es später erneut.";
const UNKNOWN_ORDER_NUMBER =
  "Diese Bestellnummer ist nicht im Katalog. Bitte prüfen Sie die Eingabe.";
const SEND_FAILED =
  "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.";

export function initialInquiryState(orderNumber = ""): InquiryState {
  return {
    status: "editing",
    values: emptyInquiryValues(orderNumber),
    fieldErrors: {},
    formError: null,
  };
}

const editing = (
  values: InquiryValues,
  errors: FieldErrors,
  formError: string | null = null
): InquiryState => ({
  status: "editing",
  values,
  fieldErrors: errors,
  formError,
});

export async function handleInquiry(
  formData: FormData,
  deps: InquiryDeps
): Promise<InquiryState> {
  const values = readInquiryForm(formData);
  const parsed = inquirySchema.safeParse(values);
  if (!parsed.success) return editing(values, fieldErrors(parsed.error));
  const inquiry = parsed.data;

  let match: VariantMatch | null = null;
  if (inquiry.orderNumber !== null) {
    const found = await deps.findVariant(inquiry.orderNumber);
    if (!found.ok) {
      if (found.error.kind === "not_found")
        return editing(values, { orderNumber: UNKNOWN_ORDER_NUMBER });
      deps.logError(
        "[inquiry] order number lookup failed",
        found.error.code ?? "unknown"
      );
      return editing(values, {}, LOOKUP_UNAVAILABLE);
    }
    match = found.value;
  }

  const sent = await deps.sender.send({
    ...inquiry,
    orderNumber: match?.orderNumber ?? null,
  });
  if (!sent.ok) {
    deps.logError("[inquiry] sender failed", "sender");
    return editing(values, {}, SEND_FAILED);
  }
  return {
    status: "discarded",
    orderNumber: match?.orderNumber ?? null,
    productName: match?.productName ?? null,
    quantity: inquiry.quantity,
  };
}

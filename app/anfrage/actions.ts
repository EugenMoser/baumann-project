"use server";

import { findVariant } from "@/lib/catalog/variant-lookup";
import { NoopInquirySender } from "@/lib/inquiry/sender";
import { handleInquiry, type InquiryState } from "@/lib/inquiry/submit";

const sender = new NoopInquirySender();

// Validates and discards (spec D6). Origin check against CSRF is built into
// Server Actions; nothing is sent or stored, so there is no rate limit (D7).
export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  return handleInquiry(formData, {
    findVariant: (q) => findVariant(q),
    sender,
    logError: (message, detail) => console.error(message, detail),
  });
}

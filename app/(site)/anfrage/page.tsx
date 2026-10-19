import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { InquiryDemoNotice } from "@/components/inquiry/demo-notice";
import { InquiryForm, type Prefill } from "@/components/inquiry/inquiry-form";
import { branding } from "@/config/branding";
import {
  findVariant,
  parseOrderNumberParam,
} from "@/lib/catalog/variant-lookup";
import { initialInquiryState } from "@/lib/inquiry/submit";
import { submitInquiry } from "./actions";

export const metadata: Metadata = {
  title: "Anfrage",
  description:
    "Anfrage zu einer Bestellnummer (Vorschau, wird nicht versendet).",
};

// searchParams makes this page render per request (spec D5).
export default async function InquiryPage({
  searchParams,
}: PageProps<"/anfrage">) {
  const { bestellnummer } = await searchParams;
  const orderNumber = parseOrderNumberParam(bestellnummer);

  let prefill: Prefill = { kind: "none" };
  let initialNumber = orderNumber ?? "";
  if (orderNumber) {
    const found = await findVariant(orderNumber);
    if (found.ok) {
      prefill = { kind: "found", match: found.value };
      initialNumber = found.value.orderNumber;
    } else if (found.error.kind === "not_found") {
      prefill = { kind: "unknown" };
    } else {
      // A failed lookup never breaks the page; the action checks again.
      console.error(
        "[inquiry] prefill lookup failed",
        found.error.code ?? "unknown"
      );
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      <PageHeader eyebrow="Anfrage" title="Anfrage" />
      <InquiryDemoNotice officialSiteUrl={branding.officialSiteUrl} />
      <InquiryForm
        action={submitInquiry}
        initialState={initialInquiryState(initialNumber)}
        prefill={prefill}
        privacyUrl={branding.developer.privacyUrl}
        officialSiteUrl={branding.officialSiteUrl}
      />
    </main>
  );
}

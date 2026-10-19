import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/site/page-header";
import { CertificateCard } from "@/components/quality/certificate-card";
import { branding } from "@/config/branding";
import { loadCertificates } from "@/lib/catalog/load";

export const metadata: Metadata = {
  title: "Qualität",
  description: "Qualitäts- und Umweltpolitik und ISO-Zertifikate.",
};

export default async function QualityPage() {
  await connection(); // per request: no database access during the build (spec D4)
  const certificates = await loadCertificates();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
      <section className="flex flex-col gap-4">
        <PageHeader
          eyebrow="Qualitäts- und Umweltmanagement"
          title="Qualitäts- und Umweltpolitik"
        />
        {branding.qualityPolicy.map((paragraph) => (
          <p key={paragraph} className="max-w-prose">
            {paragraph}
          </p>
        ))}
      </section>
      {certificates.length > 0 && (
        <section aria-labelledby="zertifikate" className="flex flex-col gap-4">
          <h2 id="zertifikate" className="text-xl font-semibold tracking-tight">
            Zertifikate
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((c) => (
              <li key={c.standard}>
                <CertificateCard certificate={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

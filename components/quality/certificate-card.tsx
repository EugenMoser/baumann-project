import Image from "next/image";
import { publicMediaUrl } from "@/lib/catalog/media";
import type { CertificateLanguage, CertificateView } from "@/lib/catalog/types";

const LANGUAGE_LABEL: Record<CertificateLanguage, string> = {
  de: "Deutsch",
  en: "Englisch",
};

export function CertificateCard({
  certificate,
}: {
  certificate: CertificateView;
}) {
  const { preview } = certificate;
  return (
    <article className="flex flex-col gap-4 rounded-md border border-line bg-paper p-4">
      <Image
        src={publicMediaUrl(preview.storagePath)}
        alt={preview.altText}
        width={preview.width}
        height={preview.height}
        sizes="(min-width: 640px) 18rem, 100vw"
        className="w-full max-w-72 rounded-sm bg-surface object-contain"
      />
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{certificate.standard}</h3>
        <p className="text-sm text-muted">{certificate.title}</p>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {certificate.documents.map((doc) => (
          <li key={doc.language}>
            <a
              href={publicMediaUrl(doc.storagePath)}
              aria-label={`${certificate.standard}: PDF, ${LANGUAGE_LABEL[doc.language]}`}
              className="text-accent underline underline-offset-2"
            >
              PDF, {LANGUAGE_LABEL[doc.language]}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

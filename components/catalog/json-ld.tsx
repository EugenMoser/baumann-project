import { serializeJsonLd } from "@/lib/catalog/structured-data";

export function JsonLd({ data }: { data: unknown }) {
  // serializeJsonLd escapes "<", so the content cannot close the script tag.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

import { describe, expect, it } from "vitest";
import { listCertificates } from "@/lib/catalog/certificates";

describe("listCertificates (FR-6)", () => {
  it("reads the seeded certificate with its documents as anon", async () => {
    const result = await listCertificates();
    expect(result).toEqual({
      ok: true,
      value: [
        {
          standard: "ISO 9001 (Beispiel)",
          title: "Qualitätsmanagement (Beispiel)",
          preview: {
            storagePath: "certificates/test-iso-9001.png",
            width: 600,
            height: 848,
            altText: "Beispielzertifikat ISO 9001",
          },
          documents: [
            {
              language: "de",
              storagePath: "certificates/test-iso-9001-de.pdf",
            },
            {
              language: "en",
              storagePath: "certificates/test-iso-9001-en.pdf",
            },
          ],
        },
      ],
    });
  });
});

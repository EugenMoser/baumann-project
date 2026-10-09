import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readCertificates,
  toPayload,
} from "../../scripts/certificates/manifest.mts";
import { makePng } from "../import/png";

const PDF = Buffer.from("%PDF-1.4\n% synthetic test file\n");

type Entry = {
  standard: string;
  title: string;
  preview: { file: string; alt: string };
  documents: { language: string; file: string }[];
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  standard: "ISO 9001",
  title: "Qualitätsmanagement",
  preview: { file: "Vorschau ISO 9001.png", alt: "Zertifikat ISO 9001" },
  documents: [
    { language: "de", file: "Zertifikat DE.pdf" },
    { language: "en", file: "Zertifikat EN.pdf" },
  ],
  ...over,
});

async function fixture(
  manifest: unknown,
  files: Record<string, Buffer> = {
    "Vorschau ISO 9001.png": makePng(60, 80),
    "Zertifikat DE.pdf": PDF,
    "Zertifikat EN.pdf": PDF,
  }
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  await writeFile(join(dir, "certificates.json"), JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(dir, name), bytes);
  return dir;
}

describe("readCertificates (FR-4, SC-4)", () => {
  it("prepares a valid manifest with normalised storage paths and dimensions", async () => {
    const result = await readCertificates(await fixture([entry()]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [cert] = result.value;
    expect(cert?.preview).toMatchObject({
      storagePath: "certificates/vorschau-iso-9001.png",
      contentType: "image/png",
      width: 60,
      height: 80,
      alt: "Zertifikat ISO 9001",
    });
    expect(cert?.documents.map((d) => [d.language, d.storagePath])).toEqual([
      ["de", "certificates/zertifikat-de.pdf"],
      ["en", "certificates/zertifikat-en.pdf"],
    ]);
    expect(toPayload(result.value)).toEqual([
      {
        standard: "ISO 9001",
        title: "Qualitätsmanagement",
        preview_path: "certificates/vorschau-iso-9001.png",
        preview_width: 60,
        preview_height: 80,
        preview_alt: "Zertifikat ISO 9001",
        sort_order: 0,
        documents: [
          { language: "de", storage_path: "certificates/zertifikat-de.pdf" },
          { language: "en", storage_path: "certificates/zertifikat-en.pdf" },
        ],
      },
    ]);
  });

  it.each([
    ["a missing manifest", null, /certificates\.json/],
    ["an empty list", [], /at least one/i],
    [
      "a duplicate standard",
      [entry(), entry()],
      /duplicate standard "ISO 9001"/,
    ],
    [
      "a duplicate language",
      [
        entry({
          documents: [
            { language: "de", file: "Zertifikat DE.pdf" },
            { language: "de", file: "Zertifikat EN.pdf" },
          ],
        }),
      ],
      /duplicate language "de"/,
    ],
    ["no documents", [entry({ documents: [] })], /documents/],
    [
      "an unknown language",
      [entry({ documents: [{ language: "fr", file: "Zertifikat DE.pdf" }] })],
      /language/,
    ],
    [
      "a missing file",
      [entry({ documents: [{ language: "de", file: "fehlt.pdf" }] })],
      /fehlt\.pdf/,
    ],
    [
      "a path segment (Review Focus 1)",
      [
        entry({
          documents: [{ language: "de", file: "../Zertifikat DE.pdf" }],
        }),
      ],
      /file name/,
    ],
    [
      "an absolute path (Review Focus 1)",
      [entry({ documents: [{ language: "de", file: "/etc/passwd" }] })],
      /file name/,
    ],
    [
      "a document that is not a PDF",
      [
        entry({
          documents: [{ language: "de", file: "Vorschau ISO 9001.png" }],
        }),
      ],
      /not a PDF/,
    ],
    [
      "an unsupported preview",
      [entry({ preview: { file: "Zertifikat DE.pdf", alt: "x" } })],
      /unsupported preview/,
    ],
  ])("rejects %s", async (_label, manifest, message) => {
    const dir =
      manifest === null
        ? await mkdtemp(join(tmpdir(), "certificates-"))
        : await fixture(manifest);
    const result = await readCertificates(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it("rejects two files that normalise to the same storage path", async () => {
    const dir = await fixture(
      [
        entry({
          documents: [
            { language: "de", file: "Zertifikat DE.pdf" },
            { language: "en", file: "zertifikat-de.pdf" },
          ],
        }),
      ],
      {
        "Vorschau ISO 9001.png": makePng(60, 80),
        "Zertifikat DE.pdf": PDF,
        "zertifikat-de.pdf": PDF,
      }
    );
    const result = await readCertificates(dir);
    expect(!result.ok && result.error).toMatch(/same storage path/);
  });
});

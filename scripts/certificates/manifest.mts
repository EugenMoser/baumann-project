// Reads and checks a hand-written certificate manifest (spec D3).
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { imageSize } from "image-size";
import { z } from "zod";
import { slugify } from "../import/map/text.mts";
import { err, ok, type Result } from "../import/result.mts";

export const MANIFEST_FILE = "certificates.json";

const fileName = z
  .string()
  .min(1)
  .refine(
    (name) => basename(name) === name && name !== "." && name !== "..",
    "must be a plain file name in the manifest directory"
  );

const manifestSchema = z
  .array(
    z.object({
      standard: z.string().trim().min(1),
      title: z.string().trim().min(1),
      preview: z.object({ file: fileName, alt: z.string().trim().min(1) }),
      documents: z
        .array(z.object({ language: z.enum(["de", "en"]), file: fileName }))
        .min(1, "needs at least one document"),
    })
  )
  .min(1, "needs at least one certificate")
  .superRefine((certs, ctx) => {
    const standards = new Set<string>();
    certs.forEach((cert, i) => {
      if (standards.has(cert.standard))
        ctx.addIssue({
          code: "custom",
          path: [i, "standard"],
          message: `duplicate standard "${cert.standard}"`,
        });
      standards.add(cert.standard);
      const languages = new Set<string>();
      for (const doc of cert.documents) {
        if (languages.has(doc.language))
          ctx.addIssue({
            code: "custom",
            path: [i, "documents"],
            message: `duplicate language "${doc.language}"`,
          });
        languages.add(doc.language);
      }
    });
  });

export type PreparedFile = {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
};
export type PreparedCertificate = {
  standard: string;
  title: string;
  sortOrder: number;
  preview: PreparedFile & { width: number; height: number; alt: string };
  documents: (PreparedFile & { language: "de" | "en" })[];
};
export type CertificatePayload = {
  standard: string;
  title: string;
  preview_path: string;
  preview_width: number;
  preview_height: number;
  preview_alt: string;
  sort_order: number;
  documents: { language: "de" | "en"; storage_path: string }[];
};

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((byte, i) => bytes[i] === byte);

function previewType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  )
    return "image/webp";
  return null;
}

const isPdf = (bytes: Uint8Array) =>
  startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

function storagePath(file: string): string {
  const dot = file.lastIndexOf(".");
  const base = slugify(dot > 0 ? file.slice(0, dot) : file);
  const extension = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
  return `certificates/${base || "file"}${extension ? `.${extension}` : ""}`;
}

async function readBytes(
  dir: string,
  file: string
): Promise<Result<Uint8Array, string>> {
  try {
    return ok(new Uint8Array(await readFile(join(dir, file))));
  } catch {
    return err(`file "${file}" cannot be read`);
  }
}

export async function readCertificates(
  dir: string
): Promise<Result<PreparedCertificate[], string>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8"));
  } catch (error: unknown) {
    return err(
      `${MANIFEST_FILE} cannot be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success)
    return err(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`)
        .join("; ")
    );

  const certificates: PreparedCertificate[] = [];
  const used = new Map<string, string>();
  const claim = (path: string, file: string): Result<string, string> => {
    const other = used.get(path);
    if (other !== undefined && other !== file)
      return err(
        `"${file}" and "${other}" map to the same storage path ${path}`
      );
    used.set(path, file);
    return ok(path);
  };

  for (const [index, cert] of parsed.data.entries()) {
    const previewBytes = await readBytes(dir, cert.preview.file);
    if (!previewBytes.ok) return previewBytes;
    const contentType = previewType(previewBytes.value);
    if (contentType === null)
      return err(
        `unsupported preview "${cert.preview.file}" (PNG, JPEG or WebP)`
      );
    const { width, height } = imageSize(previewBytes.value);
    const previewPath = claim(
      storagePath(cert.preview.file),
      cert.preview.file
    );
    if (!previewPath.ok) return previewPath;

    const documents: PreparedCertificate["documents"] = [];
    for (const doc of cert.documents) {
      const bytes = await readBytes(dir, doc.file);
      if (!bytes.ok) return bytes;
      if (!isPdf(bytes.value)) return err(`"${doc.file}" is not a PDF`);
      const path = claim(storagePath(doc.file), doc.file);
      if (!path.ok) return path;
      documents.push({
        language: doc.language,
        storagePath: path.value,
        bytes: bytes.value,
        contentType: "application/pdf",
      });
    }

    certificates.push({
      standard: cert.standard,
      title: cert.title,
      sortOrder: index,
      preview: {
        storagePath: previewPath.value,
        bytes: previewBytes.value,
        contentType,
        width,
        height,
        alt: cert.preview.alt,
      },
      documents,
    });
  }
  return ok(certificates);
}

export function toPayload(
  certs: readonly PreparedCertificate[]
): CertificatePayload[] {
  return certs.map((c) => ({
    standard: c.standard,
    title: c.title,
    preview_path: c.preview.storagePath,
    preview_width: c.preview.width,
    preview_height: c.preview.height,
    preview_alt: c.preview.alt,
    sort_order: c.sortOrder,
    documents: c.documents.map((d) => ({
      language: d.language,
      storage_path: d.storagePath,
    })),
  }));
}

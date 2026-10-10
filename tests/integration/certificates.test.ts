import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runCertificatesCli } from "../../scripts/certificates/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import { makePng } from "../import/png";
import { resetDatabase, serviceClient, silentIo } from "./import-helpers";

const client = serviceClient();
const bucket = client.storage.from("catalog");
const env = () => ({
  IMPORT_SUPABASE_URL: process.env.IMPORT_SUPABASE_URL,
  IMPORT_SUPABASE_SECRET_KEY: process.env.IMPORT_SUPABASE_SECRET_KEY,
});

async function dirWith(standards: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  const manifest = standards.map((standard, i) => ({
    standard,
    title: `Titel ${i}`,
    preview: { file: `vorschau-${i}.png`, alt: `Vorschau ${i}` },
    documents: [
      { language: "de", file: `zert-${i}-de.pdf` },
      { language: "en", file: `zert-${i}-en.pdf` },
    ],
  }));
  await writeFile(join(dir, "certificates.json"), JSON.stringify(manifest));
  for (let i = 0; i < standards.length; i += 1) {
    await writeFile(join(dir, `vorschau-${i}.png`), makePng(30, 40));
    await writeFile(join(dir, `zert-${i}-de.pdf`), Buffer.from("%PDF-1.4\n"));
    await writeFile(join(dir, `zert-${i}-en.pdf`), Buffer.from("%PDF-1.4\n"));
  }
  return dir;
}

async function certificateObjects(): Promise<string[]> {
  const listed = await listObjects(bucket, "certificates");
  if (!listed.ok) throw new Error(listed.error);
  return listed.value.sort();
}

afterAll(async () => {
  await bucket.remove(await certificateObjects());
  await resetDatabase();
});

describe("certificates:import against the local stack (FR-4, SC-4)", () => {
  it("uploads files, writes rows and removes orphans", async () => {
    await bucket.upload(
      "certificates/verwaist.pdf",
      Buffer.from("%PDF-1.4\n"),
      {
        upsert: true,
        contentType: "application/pdf",
      }
    );

    expect(
      await runCertificatesCli(
        ["--dir", await dirWith(["ISO 9001 (T)", "ISO 14001 (T)"])],
        silentIo(env())
      )
    ).toBe(0);

    const { data: rows } = await client
      .from("certificate")
      .select("standard, certificate_document(language)")
      .order("sort_order");
    expect(rows?.map((r) => r.standard)).toEqual([
      "ISO 9001 (T)",
      "ISO 14001 (T)",
    ]);
    expect(rows?.[0]?.certificate_document).toHaveLength(2);

    expect(await certificateObjects()).toEqual([
      "certificates/vorschau-0.png",
      "certificates/vorschau-1.png",
      "certificates/zert-0-de.pdf",
      "certificates/zert-0-en.pdf",
      "certificates/zert-1-de.pdf",
      "certificates/zert-1-en.pdf",
    ]);
  });

  it("a second run replaces the certificates", async () => {
    expect(
      await runCertificatesCli(
        ["--dir", await dirWith(["ISO 50001 (T)"])],
        silentIo(env())
      )
    ).toBe(0);
    const { data } = await client.from("certificate").select("standard");
    expect(data?.map((r) => r.standard)).toEqual(["ISO 50001 (T)"]);
  });

  it("leaves the rows unchanged when the run fails after the dry run", async () => {
    const before = await client.from("certificate").select("standard");
    expect(before.data).not.toHaveLength(0);
    const out = silentIo({
      ...env(),
      IMPORT_SUPABASE_SECRET_KEY: "sb_secret_wrongwrongwrongwrong",
    });
    const dir = await dirWith(["ISO 9001 (T)"]);
    expect(await runCertificatesCli(["--dir", dir, "--dry-run"], out)).toBe(0);
    expect(await runCertificatesCli(["--dir", dir], out)).toBe(1);
    const after = await client.from("certificate").select("standard");
    expect(after.data).toEqual(before.data);
  });
});

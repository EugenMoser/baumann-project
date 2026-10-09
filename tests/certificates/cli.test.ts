import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCertificatesCli } from "../../scripts/certificates/cli.mts";
import { makePng } from "../import/png";

function io(env: Record<string, string | undefined> = {}) {
  const lines: string[] = [];
  return {
    env,
    lines,
    log: (l: string) => lines.push(l),
    error: (l: string) => lines.push(l),
  };
}

async function validDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "certificates-"));
  await writeFile(
    join(dir, "certificates.json"),
    JSON.stringify([
      {
        standard: "ISO 9001",
        title: "Qualitätsmanagement",
        preview: { file: "p.png", alt: "Vorschau" },
        documents: [{ language: "de", file: "d.pdf" }],
      },
    ])
  );
  await writeFile(join(dir, "p.png"), makePng(10, 10));
  await writeFile(join(dir, "d.pdf"), Buffer.from("%PDF-1.4\n"));
  return dir;
}

describe("certificates:import CLI (FR-4, SC-4)", () => {
  it("prints usage and exits 2 without --dir", async () => {
    const out = io();
    expect(await runCertificatesCli([], out)).toBe(2);
    expect(out.lines.join("\n")).toMatch(/usage/);
  });

  it("refuses a directory inside the repository", async () => {
    expect(await runCertificatesCli(["--dir", "docs"], io())).toBe(2);
  });

  it("exits 1 on an invalid manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "certificates-"));
    await writeFile(join(dir, "certificates.json"), "[]");
    expect(await runCertificatesCli(["--dir", dir], io())).toBe(1);
  });

  it("dry run validates and writes nothing (no env, no network)", async () => {
    const out = io();
    expect(
      await runCertificatesCli(["--dir", await validDir(), "--dry-run"], out)
    ).toBe(0);
    expect(out.lines.join("\n")).toMatch(
      /Dry run: 1 certificate\(s\), 1 document\(s\)/
    );
  });

  it("exits 1 without environment when not a dry run", async () => {
    expect(await runCertificatesCli(["--dir", await validDir()], io())).toBe(1);
  });
});

// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runImportCli, type CliIo } from "./cli.mts";

const SECRET = "sb_secret_fake_guard_test_value";
let dir: string;
let logs: string[];
let errors: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "import-guard-"));
  logs = [];
  errors = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function io(url: string): CliIo {
  return {
    env: {
      IMPORT_SUPABASE_URL: url,
      IMPORT_SUPABASE_SECRET_KEY: SECRET,
      IMPORT_IMAGE_BASE_URL: "https://images.example.test",
    },
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    now: () => new Date("2026-10-19T12:00:00Z"),
  };
}

const REMOTE = "https://api.example.test";
const allErrors = () => errors.join("\n");

describe("import CLI production guard", () => {
  it("refuses a real run against a non-local target without the flag", async () => {
    const code = await runImportCli(["--snapshot", dir], io(REMOTE));
    expect(code).toBe(1);
    expect(allErrors()).toContain("--overwrite-admin-edits");
    expect(allErrors()).toMatch(/admin edits/i);
    expect(allErrors()).not.toContain("Snapshot rejected");
  });

  it("does not print env values when refusing", async () => {
    await runImportCli(["--snapshot", dir], io(REMOTE));
    const output = [...errors, ...logs].join("\n");
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain("api.example.test");
    expect(output).not.toContain("images.example.test");
  });

  it("refuses against a non-local target that merely contains localhost in its name", async () => {
    const code = await runImportCli(
      ["--snapshot", dir],
      io("https://localhost.example.test")
    );
    expect(code).toBe(1);
    expect(allErrors()).toContain("--overwrite-admin-edits");
  });

  it.each([
    // userinfo before the host: the hostname is api.example.test
    "http://localhost@api.example.test",
    "http://127.0.0.1.example.test",
    // IPv6 loopback is deliberately not on the allow-list
    "http://[::1]:54321",
  ])("refuses a real run against the non-local target %s", async (url) => {
    const code = await runImportCli(["--snapshot", dir], io(url));
    expect(code).toBe(1);
    expect(allErrors()).toContain("--overwrite-admin-edits");
    expect(allErrors()).not.toContain("Snapshot rejected");
  });

  it("allows --dry-run against a non-local target (gets past the guard)", async () => {
    const code = await runImportCli(
      ["--snapshot", dir, "--dry-run"],
      io(REMOTE)
    );
    expect(code).toBe(1);
    expect(allErrors()).toContain("Snapshot rejected");
    expect(allErrors()).not.toContain("--overwrite-admin-edits");
  });

  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://localhost",
  ])("allows a real run against the local target %s", async (url) => {
    const code = await runImportCli(["--snapshot", dir], io(url));
    expect(code).toBe(1);
    expect(allErrors()).toContain("Snapshot rejected");
    expect(allErrors()).not.toContain("--overwrite-admin-edits");
  });

  it("accepts --overwrite-admin-edits for a real run against a non-local target", async () => {
    const code = await runImportCli(
      ["--snapshot", dir, "--overwrite-admin-edits"],
      io(REMOTE)
    );
    expect(code).toBe(1);
    expect(allErrors()).toContain("Snapshot rejected");
    expect(allErrors()).not.toMatch(/unknown option/i);
  });

  it("checks the guard only after the environment is validated", async () => {
    const bad = io(REMOTE);
    bad.env = { IMPORT_SUPABASE_URL: REMOTE };
    const code = await runImportCli(["--snapshot", dir], bad);
    expect(code).toBe(1);
    expect(allErrors()).toContain("Invalid environment variables");
    expect(allErrors()).not.toContain("--overwrite-admin-edits");
  });

  it("mentions the new flag in the usage text when --snapshot is missing", async () => {
    const code = await runImportCli([], io(REMOTE));
    expect(code).toBe(2);
    expect(allErrors()).toContain(
      "usage: pnpm catalog:import --snapshot <dir> [--dry-run] [--overwrite-admin-edits]"
    );
  });
});

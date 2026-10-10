import { describe, expect, it, vi } from "vitest";
import {
  runAdminCreate,
  type AdminCreateIo,
} from "../../scripts/admin/create.mts";

const SECRET = "correct horse battery staple";

function io(password = SECRET, env: Record<string, string> = {}) {
  const lines: string[] = [];
  const value: AdminCreateIo = {
    env,
    log: (l) => lines.push(l),
    error: (l) => lines.push(l),
    readPassword: vi.fn().mockResolvedValue(password),
  };
  return { io: value, lines };
}

describe("admin:create argument checks (SC-3)", () => {
  it("requires --email", async () => {
    const { io: x, lines } = io();
    expect(await runAdminCreate([], x)).toBe(2);
    expect(lines.join("\n")).toMatch(/usage/);
  });
  it("rejects an invalid e-mail", async () => {
    const { io: x } = io();
    expect(await runAdminCreate(["--email", "nope"], x)).toBe(2);
  });
  it("rejects a short password without echoing it", async () => {
    const { io: x, lines } = io("short-pw");
    expect(await runAdminCreate(["--email", "a@example.com"], x)).toBe(2);
    expect(lines.join("\n")).toMatch(/at least 12/);
    expect(lines.join("\n")).not.toContain("short-pw");
  });
  it("fails on missing env without printing secrets", async () => {
    const { io: x, lines } = io();
    expect(await runAdminCreate(["--email", "a@example.com"], x)).toBe(1);
    expect(lines.join("\n")).not.toContain(SECRET);
  });
});

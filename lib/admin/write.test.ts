import { describe, expect, it, vi, type Mock } from "vitest";
import { err, ok } from "@/lib/result";
import { adminWrite, type WriteDeps } from "./write";

function deps(kind: "admin" | "forbidden" | "anonymous"): WriteDeps & {
  revalidate: Mock<() => void>;
  logError: Mock<(context: string, code: string | null) => void>;
} {
  const check =
    kind === "admin"
      ? ({ kind, userId: "u", email: "admin@example.com" } as const)
      : kind === "forbidden"
        ? ({ kind, email: "x@example.com" } as const)
        : ({ kind } as const);
  return {
    check: vi.fn().mockResolvedValue(check),
    revalidate: vi.fn<() => void>(),
    logError: vi.fn<(context: string, code: string | null) => void>(),
  };
}

describe("adminWrite (SC-13, SC-14, Review Focus 3)", () => {
  it("revalidates after a successful write", async () => {
    const d = deps("admin");
    const out = await adminWrite(d, "[admin] test", async () => ok(1));
    expect(out).toEqual({ kind: "done", result: ok(1) });
    expect(d.revalidate).toHaveBeenCalledTimes(1);
  });
  it("never revalidates after a failed write and logs only context and code", async () => {
    const d = deps("admin");
    await adminWrite(d, "[admin] test", async () =>
      err({ kind: "db_error", code: "XX000" } as const)
    );
    expect(d.revalidate).not.toHaveBeenCalled();
    expect(d.logError).toHaveBeenCalledWith("[admin] test", "XX000");
    expect(JSON.stringify(d.logError.mock.calls)).not.toContain("@");
  });
  it("does not log expected errors", async () => {
    const d = deps("admin");
    await adminWrite(d, "[admin] test", async () =>
      err({ kind: "conflict", field: "slug" } as const)
    );
    expect(d.logError).not.toHaveBeenCalled();
  });
  it("returns anonymous without writing when the session is gone", async () => {
    const d = deps("anonymous");
    const write = vi.fn();
    expect(await adminWrite(d, "[admin] test", write)).toEqual({
      kind: "anonymous",
    });
    expect(write).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });
  it("returns forbidden without writing for non-admins", async () => {
    const d = deps("forbidden");
    const write = vi.fn();
    expect(await adminWrite(d, "[admin] test", write)).toEqual({
      kind: "done",
      result: err({ kind: "forbidden" }),
    });
    expect(write).not.toHaveBeenCalled();
  });
});

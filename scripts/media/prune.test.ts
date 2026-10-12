import { describe, expect, it, vi } from "vitest";
import {
  PAGE_SIZE,
  fetchAllPages,
  parseCreatedAt,
  planPrune,
  runPrune,
  type PruneDeps,
} from "./prune.mts";

const now = new Date("2026-10-10T12:00:00Z");
const old = new Date("2026-10-10T10:00:00Z");
const young = new Date("2026-10-10T11:30:00Z");

describe("planPrune (SC-7)", () => {
  it("finds unlinked rows and unreferenced old files under products/", () => {
    const plan = planPrune(
      [
        { id: 1, storagePath: "products/a.png", linked: true },
        { id: 2, storagePath: "products/b.png", linked: false },
      ],
      [
        { path: "products/a.png", createdAt: old },
        { path: "products/b.png", createdAt: young }, // file of an unlinked row: removed regardless of age
        { path: "products/c.png", createdAt: old }, // orphan
        { path: "products/d.png", createdAt: young }, // upload in flight
        { path: "certificates/x.pdf", createdAt: old }, // never touched
      ],
      now
    );
    expect(plan).toEqual({
      rowIds: [2],
      files: ["products/b.png", "products/c.png"],
    });
  });
});

function deps(overrides: Partial<PruneDeps> = {}): PruneDeps {
  return {
    readRows: vi.fn(async () => ({
      ok: true as const,
      value: [{ id: 2, storagePath: "products/b.png", linked: false }],
    })),
    listObjects: vi.fn(async () => ({
      ok: true as const,
      value: [{ path: "products/b.png", createdAt: old }],
    })),
    deleteRows: vi.fn(async () => ({ ok: true as const, value: null })),
    removeFiles: vi.fn(async () => ({ ok: true as const, value: null })),
    ...overrides,
  };
}
const io = () => ({ log: vi.fn(), error: vi.fn() });

describe("runPrune (SC-7)", () => {
  it("deletes nothing without --apply", async () => {
    const d = deps();
    const out = io();
    expect(await runPrune(d, false, out, now)).toBe(0);
    expect(d.deleteRows).not.toHaveBeenCalled();
    expect(d.removeFiles).not.toHaveBeenCalled();
    expect(out.log).toHaveBeenCalledWith("unlinked media rows: 1");
    expect(out.log).toHaveBeenCalledWith("orphan files: 1");
  });

  it("deletes rows first, then files with --apply", async () => {
    const order: string[] = [];
    const d = deps({
      deleteRows: vi.fn(async () => {
        order.push("rows");
        return { ok: true as const, value: null };
      }),
      removeFiles: vi.fn(async () => {
        order.push("files");
        return { ok: true as const, value: null };
      }),
    });
    expect(await runPrune(d, true, io(), now)).toBe(0);
    expect(order).toEqual(["rows", "files"]);
  });

  it("exits 1 on a storage error", async () => {
    const d = deps({
      listObjects: vi.fn(async () => ({
        ok: false as const,
        error: "listing failed",
      })),
    });
    const out = io();
    expect(await runPrune(d, true, out, now)).toBe(1);
    expect(out.error).toHaveBeenCalledWith("listing failed");
  });
});

describe("runPrune fail-closed (SC-7)", () => {
  it("exits 1 when linked rows exist but no files are listed", async () => {
    const d = deps({
      readRows: vi.fn(async () => ({
        ok: true as const,
        value: [{ id: 1, storagePath: "products/a.png", linked: true }],
      })),
      listObjects: vi.fn(async () => ({ ok: true as const, value: [] })),
    });
    const out = io();
    expect(await runPrune(d, true, out, now)).toBe(1);
    expect(out.error).toHaveBeenCalled();
    expect(d.deleteRows).not.toHaveBeenCalled();
    expect(d.removeFiles).not.toHaveBeenCalled();
  });
});

describe("parseCreatedAt", () => {
  it("treats a missing or invalid date as now (protected)", () => {
    expect(parseCreatedAt(null, now)).toBe(now);
    expect(parseCreatedAt(undefined, now)).toBe(now);
    expect(parseCreatedAt("not a date", now)).toBe(now);
    expect(parseCreatedAt("2026-10-10T10:00:00Z", now)).toEqual(old);
  });

  it("keeps a file without a date out of the plan", () => {
    const plan = planPrune(
      [],
      [{ path: "products/x.png", createdAt: parseCreatedAt(null, now) }],
      now
    );
    expect(plan.files).toEqual([]);
  });
});

describe("fetchAllPages", () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => i);

  it("reads every page until a short one", async () => {
    const calls: [number, number][] = [];
    const pages = [full, full, [1, 2, 3]];
    const result = await fetchAllPages<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: pages[calls.length - 1] ?? [], error: null };
    });
    expect(result).toEqual({
      ok: true,
      value: [...full, ...full, 1, 2, 3],
    });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more after an exactly full last page", async () => {
    const pages = [full, []];
    let n = 0;
    const result = await fetchAllPages<number>(async () => ({
      data: pages[n++] ?? [],
      error: null,
    }));
    expect(n).toBe(2);
    expect(result.ok && result.value.length).toBe(PAGE_SIZE);
  });

  it("returns an error when page 2 fails", async () => {
    let n = 0;
    const result = await fetchAllPages<number>(async () =>
      n++ === 0
        ? { data: full, error: null }
        : { data: null, error: { message: "boom" } }
    );
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

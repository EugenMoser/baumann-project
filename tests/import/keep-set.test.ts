// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanupOrphans,
  readMediaPaths,
} from "../../scripts/import/keep-set.mts";
import type { StorageBucket } from "../../scripts/import/images.mts";

const upload = "products/7/0b1f6a52-aaaa-4bbb-8ccc-123456789abc.png";
const imported = "products/moebel/p/a.webp";
const stray = "products/moebel/p/old.webp";

function fakeBucket(files: string[]) {
  const removed: string[] = [];
  const bucket = {
    async list(prefix: string) {
      const rest = files
        .filter((f) => f.startsWith(`${prefix}/`))
        .map((f) => f.slice(prefix.length + 1));
      const names = new Map<string, string | null>();
      for (const r of rest) {
        const [head] = r.split("/");
        names.set(head, r.includes("/") ? null : head);
      }
      return {
        data: [...names].map(([name, id]) => ({ name, id })),
        error: null,
      };
    },
    async remove(paths: string[]) {
      removed.push(...paths);
      return { error: null };
    },
  } as unknown as StorageBucket;
  return { bucket, removed };
}

describe("cleanupOrphans", () => {
  it("keeps files that a media row references and removes the rest", async () => {
    const { bucket, removed } = fakeBucket([upload, imported, stray]);
    const result = await cleanupOrphans(
      bucket,
      new Set([imported]),
      async () => ({ ok: true, value: [upload] })
    );
    expect(result).toEqual({ ok: true, value: 1 });
    expect(removed).toEqual([stray]);
  });

  it("deletes nothing when the database paths cannot be read", async () => {
    const { bucket, removed } = fakeBucket([upload, stray]);
    const result = await cleanupOrphans(bucket, new Set(), async () => ({
      ok: false,
      error: "boom",
    }));
    expect(result.ok).toBe(false);
    expect(removed).toEqual([]);
  });
});

describe("readMediaPaths", () => {
  it("pages through all rows", async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({
      storage_path: `products/1/${i}.png`,
    }));
    const calls: [number, number][] = [];
    const result = await readMediaPaths(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result.ok && result.value.length).toBe(2300);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("fails when a page fails", async () => {
    const result = await readMediaPaths(async () => ({
      data: null,
      error: { message: "down" },
    }));
    expect(result.ok).toBe(false);
  });
});

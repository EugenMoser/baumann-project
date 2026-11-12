// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createSlugIndex, type SlugSnapshot } from "./known-slugs";

const snap = (categories: string[], products: string[]): SlugSnapshot => ({
  categories: new Set(categories),
  products: new Set(products),
});

function setup(first: SlugSnapshot, minRefreshMs?: number) {
  let time = 1_000_000;
  const load = vi.fn<() => Promise<SlugSnapshot>>().mockResolvedValue(first);
  const index = createSlugIndex(load, { minRefreshMs, now: () => time });
  return {
    load,
    index,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createSlugIndex", () => {
  it("loads on the first call and knows a listed product", async () => {
    const { index, load } = setup(snap(["a"], ["a/x"]));
    expect(await index.isKnown("a", "x")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("knows a listed category without a product", async () => {
    const { index } = setup(snap(["a"], ["a/x"]));
    expect(await index.isKnown("a")).toBe(true);
  });

  it("rejects an unknown category on a first lookup", async () => {
    const { index } = setup(snap(["a"], ["a/x"]));
    expect(await index.isKnown("zzz")).toBe(false);
  });

  it("does not accept a product under the wrong category", async () => {
    const { index } = setup(snap(["a", "b"], ["a/x"]));
    expect(await index.isKnown("b", "x")).toBe(false);
  });

  it("does not reload on a miss inside the throttle window", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    advance(9_999);
    expect(await index.isKnown("a", "nope")).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once on a miss after the throttle window and re-checks", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    advance(10_000);
    expect(await index.isKnown("a", "nope")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await index.isKnown("a", "nope2")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("finds a product that was added after the first load", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    load.mockResolvedValue(snap(["a"], ["a/x", "a/new"]));
    advance(10_000);
    expect(await index.isKnown("a", "new")).toBe(true);
  });

  it("honours a custom minRefreshMs", async () => {
    const { index, load, advance } = setup(snap(["a"], []), 500);
    await index.isKnown("a");
    advance(500);
    await index.isKnown("zzz");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads on the next miss after invalidate, inside the throttle window", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    load.mockResolvedValue(snap(["a"], ["a/x", "a/new"]));
    advance(1_000);
    index.invalidate();
    expect(await index.isKnown("a", "new")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await index.isKnown("a", "nope")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads once more when invalidate lands during an in-flight load", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    let finishStale!: (s: SlugSnapshot) => void;
    load.mockImplementationOnce(
      () => new Promise((resolve) => (finishStale = resolve))
    );
    load.mockResolvedValue(snap(["a"], ["a/x", "a/new"]));
    advance(1_000);
    index.invalidate();
    const pending = index.isKnown("a", "new");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    // The admin write commits after this load has read the old rows.
    index.invalidate();
    finishStale(snap(["a"], ["a/x"]));
    expect(await pending).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("lets concurrent callers of a stale load share one retry after invalidate", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    let finishStale!: (s: SlugSnapshot) => void;
    load.mockImplementationOnce(
      () => new Promise((resolve) => (finishStale = resolve))
    );
    load.mockResolvedValue(snap(["a"], ["a/x", "a/new"]));
    advance(1_000);
    index.invalidate();
    const pending = Promise.all([
      index.isKnown("a", "new"),
      index.isKnown("a", "new"),
    ]);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    index.invalidate();
    finishStale(snap(["a"], ["a/x"]));
    expect(await pending).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("fails open when the retry after invalidate fails", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    let finishStale!: (s: SlugSnapshot) => void;
    load.mockImplementationOnce(
      () => new Promise((resolve) => (finishStale = resolve))
    );
    load.mockRejectedValueOnce(new Error("db down"));
    advance(1_000);
    index.invalidate();
    const pending = index.isKnown("a", "new");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    index.invalidate();
    finishStale(snap(["a"], ["a/x"]));
    expect(await pending).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("fails open without a snapshot inside the throttle window after a failed load", async () => {
    const { index, load, advance } = setup(snap([], []));
    load.mockRejectedValue(new Error("db down"));
    await index.isKnown("a", "x");
    advance(5_000);
    expect(await index.isKnown("zzz")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps knowing a removed slug until the next reload (bounded staleness)", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    await index.isKnown("a", "x");
    load.mockResolvedValue(snap(["a"], []));
    advance(10_000);
    // A hit never reloads, so the stale entry still passes.
    expect(await index.isKnown("a", "x")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    // The next miss after the window reloads and drops it.
    expect(await index.isKnown("zzz")).toBe(false);
    expect(await index.isKnown("a", "x")).toBe(false);
  });

  it("shares one in-flight load between concurrent calls", async () => {
    const { index, load } = setup(snap(["a"], ["a/x"]));
    const results = await Promise.all([
      index.isKnown("a", "x"),
      index.isKnown("a"),
      index.isKnown("zzz"),
    ]);
    expect(results).toEqual([true, true, false]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fails open when the loader rejects", async () => {
    const { index, load } = setup(snap([], []));
    load.mockRejectedValue(new Error("db down"));
    expect(await index.isKnown("anything", "at-all")).toBe(true);
  });

  it("counts a failed attempt for the throttle", async () => {
    const { index, load, advance } = setup(snap([], []));
    load.mockRejectedValue(new Error("db down"));
    await index.isKnown("a", "x");
    advance(5_000);
    await index.isKnown("a", "y");
    expect(load).toHaveBeenCalledTimes(1);
    advance(5_000);
    await index.isKnown("a", "z");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("recovers after a failed load once the loader works again", async () => {
    const { index, load, advance } = setup(snap(["a"], ["a/x"]));
    load.mockRejectedValueOnce(new Error("db down"));
    expect(await index.isKnown("a", "x")).toBe(true);
    advance(10_000);
    expect(await index.isKnown("zzz")).toBe(false);
    expect(await index.isKnown("a", "x")).toBe(true);
  });
});

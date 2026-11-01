import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/lib/result";
import type { AdminError } from "./errors";
import { withSlugRetry } from "./slugs";

const slugConflict = err({ kind: "conflict", field: "slug" } as const);

describe("withSlugRetry (6c SC-1)", () => {
  it("returns the first ok result without retrying", async () => {
    const attempt = vi.fn(async () => ok(7));
    expect(await withSlugRetry(attempt)).toEqual(ok(7));
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a slug conflict and succeeds on the second try", async () => {
    const attempt = vi
      .fn<() => Promise<Result<number, AdminError>>>()
      .mockResolvedValueOnce(slugConflict)
      .mockResolvedValueOnce(ok(9));
    expect(await withSlugRetry(attempt)).toEqual(ok(9));
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after three slug conflicts with a generic db error", async () => {
    const attempt = vi.fn(async () => slugConflict);
    expect(await withSlugRetry(attempt)).toEqual(
      err({ kind: "db_error", code: "23505" })
    );
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("passes other errors through after one call", async () => {
    const attempt = vi.fn(async () => err({ kind: "forbidden" } as const));
    expect(await withSlugRetry(attempt)).toEqual(err({ kind: "forbidden" }));
    const other = vi.fn(async () =>
      err({ kind: "conflict", field: "articleNumber" } as const)
    );
    expect(await withSlugRetry(other)).toEqual(
      err({ kind: "conflict", field: "articleNumber" })
    );
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });
});

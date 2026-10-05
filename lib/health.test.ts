import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth (FR-11, SC-11)", () => {
  it("reports ok when the probe succeeds", async () => {
    expect(await checkHealth(async () => true, "abc123")).toEqual({
      commit: "abc123",
      db: "ok",
    });
  });

  it("reports error when the probe returns false", async () => {
    expect(await checkHealth(async () => false, "abc123")).toEqual({
      commit: "abc123",
      db: "error",
    });
  });

  it("reports error when the probe throws", async () => {
    const probe = async () => {
      throw new Error("connection refused");
    };
    expect((await checkHealth(probe, "abc123")).db).toBe("error");
  });

  it("reports error when the probe hangs longer than the timeout", async () => {
    const hanging = () => new Promise<boolean>(() => {});
    const started = Date.now();
    expect((await checkHealth(hanging, "abc123", 50)).db).toBe("error");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("passes an abort signal that fires on timeout", async () => {
    let aborted = false;
    const probe = (signal: AbortSignal) =>
      new Promise<boolean>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve(false);
        });
      });
    await checkHealth(probe, "abc123", 20);
    expect(aborted).toBe(true);
  });

  it("uses 'unknown' when no commit is configured", async () => {
    expect((await checkHealth(async () => true, undefined)).commit).toBe(
      "unknown"
    );
  });
});

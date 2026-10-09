import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { unwrap } from "./load";

afterEach(() => vi.restoreAllMocks());

describe("unwrap (FR-14, SC-14)", () => {
  it("returns the value of an ok result", () => {
    expect(unwrap({ ok: true, value: 42 }, "test")).toBe(42);
  });

  it("maps not_found to notFound()", () => {
    expect(() =>
      unwrap({ ok: false, error: { kind: "not_found" } }, "test")
    ).toThrow("NEXT_NOT_FOUND");
  });

  it("logs db errors and throws a generic error without details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let thrown: unknown;
    try {
      unwrap(
        {
          ok: false,
          error: {
            kind: "db_error",
            code: "42P01",
            message: 'relation "x" does not exist',
          },
        },
        "product page"
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Katalogdaten konnten nicht geladen werden."
    );
    expect((thrown as Error).message).not.toContain("relation");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("product page"),
      "42P01",
      'relation "x" does not exist'
    );
  });
});

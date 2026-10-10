import { describe, expect, it } from "vitest";
import { formErrorFor, fromPg, GENERIC_SAVE_ERROR } from "./errors";

describe("fromPg", () => {
  it("maps a known unique violation to a field conflict", () => {
    expect(
      fromPg(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "article_article_number_key"',
        },
        { article_article_number_key: "articleNumber" }
      )
    ).toEqual({ kind: "conflict", field: "articleNumber" });
  });
  it("maps an unknown unique violation to db_error", () => {
    expect(fromPg({ code: "23505", message: "other" }, {})).toEqual({
      kind: "db_error",
      code: "23505",
    });
  });
  it.each([
    ["42501", { kind: "forbidden" }],
    ["P0002", { kind: "not_found" }],
    [
      "22023",
      { kind: "invalid", message: "Genau eine Farbe muss Standard sein." },
    ],
    [
      "23514",
      { kind: "invalid", message: "Ein Wert passt nicht zum Attributtyp." },
    ],
    ["XX000", { kind: "db_error", code: "XX000" }],
  ])("maps %s", (code, expected) => {
    expect(
      fromPg({ code, message: "Genau eine Farbe muss Standard sein." })
    ).toEqual(expected);
  });
  it("does not expose English Postgres 22023 messages", () => {
    expect(
      fromPg({
        code: "22023",
        message: "cannot extract elements from a scalar",
      })
    ).toEqual({ kind: "db_error", code: "22023" });
  });
  it("uses the generic message for db errors", () => {
    expect(formErrorFor({ kind: "db_error", code: null })).toBe(
      GENERIC_SAVE_ERROR
    );
    expect(formErrorFor({ kind: "conflict", field: "slug" })).toBeNull();
  });
});

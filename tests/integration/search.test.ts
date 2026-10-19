import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { searchCatalog, withThumbnails } from "@/lib/catalog/search";
import type { Database } from "@/lib/supabase/database.types";

const unreachable = createClient<Database>(
  "http://127.0.0.1:9",
  "sb_publishable_unreachable",
  { auth: { persistSession: false } }
);

describe("searchCatalog (FR-8, SC-8)", () => {
  it("maps an exact order-number hit", async () => {
    expect(await searchCatalog("99010 - 1")).toEqual({
      ok: true,
      value: [
        {
          categorySlug: "moebelteile",
          productSlug: "testkeil-mit-daempfung",
          name: "Testkeil mit Dämpfung",
          subtitle: "für Beispielschlösser",
          matchedNumbers: ["99010 - 1"],
          matchKind: "exact_number",
        },
      ],
    });
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await searchCatalog("Gibtesnicht")).toEqual({ ok: true, value: [] });
  });

  it("returns a db_error when the database is unreachable", async () => {
    const result = await searchCatalog("Keil", unreachable);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("db_error");
  });
});

describe("withThumbnails (D5)", () => {
  it("returns the thumbnail of the hit product", async () => {
    const hits = await searchCatalog("Testkeil");
    expect(hits.ok).toBe(true);
    if (!hits.ok) return;
    const result = await withThumbnails(hits.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0].thumbnail?.storagePath).toBe(
      "products/testkeil-1.webp"
    );
  });

  it("returns ok([]) for no hits without querying", async () => {
    expect(await withThumbnails([], unreachable)).toEqual({
      ok: true,
      value: [],
    });
  });
});

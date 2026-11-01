import { describe, expect, it } from "vitest";
import type { CatalogClient } from "@/lib/supabase/server";
import { PRODUCT_TILE } from "./categories";
import { TILE_MEDIA } from "./media";
import { withThumbnails } from "./search";
import type { SearchHit } from "./types";

// Minimal stand-in for the chained from().select().in() call; it records the
// select string and resolves with an empty result.
function recordingClient() {
  const selects: string[] = [];
  const client = {
    from: () => ({
      select: (columns: string) => {
        selects.push(columns);
        return { in: () => Promise.resolve({ data: [], error: null }) };
      },
    }),
  };
  return { client: client as unknown as CatalogClient, selects };
}

const hit: SearchHit = {
  categorySlug: "a",
  productSlug: "keil",
  name: "Keil",
  subtitle: null,
  matchedNumbers: [],
  matchKind: "text",
};

describe("shared tile media select (4b SC-2)", () => {
  it("(4b SC-2) product tiles select the same media as TILE_MEDIA", () => {
    expect(PRODUCT_TILE).toContain(TILE_MEDIA);
  });

  it("(4b SC-2) search thumbnails select TILE_MEDIA", async () => {
    const { client, selects } = recordingClient();
    const result = await withThumbnails([hit], client);
    expect(result.ok).toBe(true);
    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain(TILE_MEDIA);
  });
});

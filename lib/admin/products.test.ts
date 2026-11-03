import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { saveProduct } from "./products";
import type { ProductInput } from "./schemas";

const input: ProductInput = {
  categoryId: 4,
  name: "Dachhaube",
  subtitle: null,
  description: null,
  materialId: null,
  materialNote: null,
  status: "draft",
  sortOrder: 0,
  seoTitle: null,
  seoDescription: null,
};

// Awaiting the select chain yields the next queued slug read; the insert
// loses the unique constraint on its first call only.
function fakeClient(reads: string[][]) {
  const inserts: { slug: string }[] = [];
  const select = vi.fn(() => {
    const rows = reads.shift() ?? [];
    const chain: Record<string, unknown> = {
      eq: () => chain,
      neq: () => chain,
      or: () => chain,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: rows.map((slug) => ({ slug })), error: null }),
    };
    return chain;
  });
  const insert = vi.fn((row: { slug: string }) => {
    inserts.push(row);
    return {
      select: () => ({
        single: async () =>
          inserts.length === 1
            ? {
                data: null,
                error: {
                  code: "23505",
                  message:
                    'duplicate key value violates unique constraint "product_category_id_slug_key"',
                },
              }
            : { data: { id: 11 }, error: null },
      }),
    };
  });
  const from = vi.fn(() => ({ select, insert }));
  return { client: { from } as unknown as AdminClient, select, inserts };
}

describe("saveProduct slug retry (6c SC-1)", () => {
  it("retries the product insert with a new slug after a concurrent unique violation", async () => {
    // The second read sees the slug the concurrent save just took.
    const { client, select, inserts } = fakeClient([[], ["dachhaube"]]);

    const result = await saveProduct(client, null, input);

    expect(result).toEqual(ok({ id: 11 }));
    expect(select).toHaveBeenCalledTimes(2);
    expect(inserts.map((r) => r.slug)).toEqual(["dachhaube", "dachhaube-2"]);
  });
});

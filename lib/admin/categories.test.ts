import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { saveCategory } from "./categories";
import type { CategoryInput } from "./category-schema";

const input: CategoryInput = {
  name: "Dachhauben",
  introText: "",
  seoTitle: null,
  seoDescription: null,
  sortOrder: 0,
  attributes: [],
};

// Awaiting the select chain yields the next queued slug read; the RPC loses
// the unique constraint on its first call only.
function fakeClient(reads: string[][]) {
  const payloads: { slug: string }[] = [];
  const select = vi.fn(() => {
    const rows = reads.shift() ?? [];
    const chain: Record<string, unknown> = {
      or: () => chain,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: rows.map((slug) => ({ slug })), error: null }),
    };
    return chain;
  });
  const rpc = vi.fn(
    async (_name: string, args: { payload: { slug: string } }) => {
      payloads.push(args.payload);
      return payloads.length === 1
        ? {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "category_slug_key"',
            },
          }
        : { data: 5, error: null };
    }
  );
  const from = vi.fn(() => ({ select }));
  return { client: { from, rpc } as unknown as AdminClient, select, payloads };
}

describe("saveCategory slug retry (6c SC-1)", () => {
  it("retries the category save with a new slug after a concurrent unique violation", async () => {
    // The second read sees the slug the concurrent save just took.
    const { client, select, payloads } = fakeClient([[], ["dachhauben"]]);

    const result = await saveCategory(client, null, input);

    expect(result).toEqual(ok({ id: 5 }));
    expect(select).toHaveBeenCalledTimes(2);
    expect(payloads.map((p) => p.slug)).toEqual(["dachhauben", "dachhauben-2"]);
  });
});

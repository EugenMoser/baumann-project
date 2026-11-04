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

// In-memory stand-in for the two tables the update path touches. The
// ai_generation query applies eq/gt/is like the database, so a row only
// comes back when the query carries the matching filter.
type GenRow = {
  id: number;
  entity: string;
  entity_id: number;
  field: string;
  output: string;
  created_at: string;
  accepted_at: string | null;
};
const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const genRow = (patch: Partial<GenRow> & { id: number }): GenRow => ({
  entity: "product",
  entity_id: 7,
  field: "description",
  output: "Vorschlag",
  created_at: hoursAgo(1),
  accepted_at: null,
  ...patch,
});

function updateClient(
  rows: GenRow[],
  opts: { markError?: boolean; lookupError?: boolean } = {}
) {
  const productUpdates: Record<string, unknown>[] = [];
  const marks: {
    patch: Record<string, unknown>;
    ids: number[];
    isArgs: unknown[];
  }[] = [];
  const prev = {
    category_id: 4,
    slug: "dachhaube",
    description: null,
    seo_title: null,
    seo_description: null,
    description_origin: "human",
    seo_origin: "human",
  };
  const product = {
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: prev, error: null }) }),
    }),
    update: (row: Record<string, unknown>) => {
      productUpdates.push(row);
      return {
        eq: () => ({
          select: async () => ({ data: [{ id: 7 }], error: null }),
        }),
      };
    },
  };
  const generation = {
    select: () => {
      const filters: ((r: GenRow) => boolean)[] = [];
      const chain = {
        eq: (col: keyof GenRow, v: unknown) => {
          filters.push((r) => r[col] === v);
          return chain;
        },
        gt: (col: keyof GenRow, v: string) => {
          filters.push((r) => String(r[col]) > v);
          return chain;
        },
        is: (col: keyof GenRow, v: null) => {
          filters.push((r) => r[col] === v);
          return chain;
        },
        maybeSingle: async () =>
          opts.lookupError
            ? { data: null, error: { code: "XX000", message: "boom" } }
            : {
                data: rows.find((r) => filters.every((f) => f(r))) ?? null,
                error: null,
              },
      };
      return chain;
    },
    update: (patch: Record<string, unknown>) => ({
      in: (_col: string, ids: number[]) => {
        const mark = { patch, ids, isArgs: [] as unknown[] };
        marks.push(mark);
        const result = {
          data: null,
          error: opts.markError ? { code: "XX000", message: "boom" } : null,
        };
        return {
          is: async (...args: unknown[]) => {
            mark.isArgs = args;
            return result;
          },
        };
      },
    }),
  };
  const from = vi.fn((table: string) =>
    table === "product" ? product : generation
  );
  return {
    client: { from } as unknown as AdminClient,
    productUpdates,
    marks,
  };
}

const none = { description: null, seoTitle: null, seoDescription: null };
const typed = (patch: Partial<typeof input>): ProductInput => ({
  ...input,
  ...patch,
});

describe("saveProduct with accepted suggestions (SC-6)", () => {
  it("sets ai and marks the row accepted after the update", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 31 }),
    ]);
    const result = await saveProduct(
      client,
      7,
      typed({ description: "Vorschlag" }),
      { ...none, description: 31 }
    );
    expect(result).toEqual(ok({ id: 7 }));
    expect(productUpdates[0]).toMatchObject({ description_origin: "ai" });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.ids).toEqual([31]);
    expect(marks[0]?.patch.accepted_at).toEqual(expect.any(String));
    // Guards against marking a row a parallel save accepted first.
    expect(marks[0]?.isArgs).toEqual(["accepted_at", null]);
  });

  it("counts CRLF line breaks as unchanged (R11)", async () => {
    const { client, productUpdates } = updateClient([
      genRow({ id: 31, output: "Eins\nZwei" }),
    ]);
    await saveProduct(client, 7, typed({ description: "Eins\r\nZwei" }), {
      ...none,
      description: 31,
    });
    expect(productUpdates[0]).toMatchObject({ description_origin: "ai" });
  });

  it("marks an edited acceptance ai_edited", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 31 }),
    ]);
    await saveProduct(client, 7, typed({ description: "Vorschlag plus" }), {
      ...none,
      description: 31,
    });
    expect(productUpdates[0]).toMatchObject({
      description_origin: "ai_edited",
    });
    expect(marks[0]?.ids).toEqual([31]);
  });

  it("derives the SEO origin from the accepted SEO rows", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 32, field: "seo_title", output: "Titel" }),
      genRow({ id: 33, field: "seo_description", output: "Beschreibung" }),
    ]);
    await saveProduct(
      client,
      7,
      typed({ seoTitle: "Titel", seoDescription: "Beschreibung" }),
      { description: null, seoTitle: 32, seoDescription: 33 }
    );
    expect(productUpdates[0]).toMatchObject({ seo_origin: "ai" });
    expect(marks[0]?.ids.sort()).toEqual([32, 33]);
  });

  describe.each([
    ["a row of another product", { entity_id: 8 }],
    ["a row of another field", { field: "seo_title" }],
    ["a row older than 24 h", { created_at: hoursAgo(25) }],
    ["a row that was accepted before", { accepted_at: hoursAgo(2) }],
  ] as const)("ignores %s", (_label, patch) => {
    it("falls back to the plain rule, warns and marks nothing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, productUpdates, marks } = updateClient([
        genRow({ id: 31, ...patch }),
      ]);
      const result = await saveProduct(
        client,
        7,
        typed({ description: "Vorschlag" }),
        { ...none, description: 31 }
      );
      expect(result).toEqual(ok({ id: 7 }));
      // No accepted row: the product was human, so the text stays human.
      expect(productUpdates[0]).toMatchObject({ description_origin: "human" });
      expect(marks).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(
        "[admin] ignored AI suggestion id",
        "description"
      );
      warn.mockRestore();
    });
  });

  it("keeps the AI origin for one valid SEO id next to an ignored one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 32, field: "seo_title", output: "Titel" }),
      genRow({ id: 33, field: "seo_description", entity_id: 8 }),
    ]);
    await saveProduct(
      client,
      7,
      typed({ seoTitle: "Titel", seoDescription: "Eigener Text" }),
      { description: null, seoTitle: 32, seoDescription: 33 }
    );
    // The ignored id leaves the human SEO description next to the AI title.
    expect(productUpdates[0]).toMatchObject({ seo_origin: "ai_edited" });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.ids).toEqual([32]);
    expect(warn).toHaveBeenCalledWith(
      "[admin] ignored AI suggestion id",
      "seo_description"
    );
    warn.mockRestore();
  });

  it("drops an accepted description that is saved empty", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 31 }),
    ]);
    const result = await saveProduct(client, 7, typed({ description: null }), {
      ...none,
      description: 31,
    });
    expect(result).toEqual(ok({ id: 7 }));
    expect(productUpdates[0]).toMatchObject({ description_origin: "human" });
    expect(marks).toHaveLength(0);
  });

  it("falls back to the plain rule when the accepted SEO title is saved empty", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 32, field: "seo_title", output: "Titel" }),
    ]);
    await saveProduct(
      client,
      7,
      typed({ seoTitle: null, seoDescription: "Eigener Text" }),
      { description: null, seoTitle: 32, seoDescription: null }
    );
    // No AI text remains: the human description stays human.
    expect(productUpdates[0]).toMatchObject({ seo_origin: "human" });
    expect(marks).toHaveLength(0);
  });

  it("marks only the accepted SEO row that is still saved", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 32, field: "seo_title", output: "Titel" }),
      genRow({ id: 33, field: "seo_description", output: "Beschreibung" }),
    ]);
    await saveProduct(
      client,
      7,
      typed({ seoTitle: null, seoDescription: "Beschreibung" }),
      { description: null, seoTitle: 32, seoDescription: 33 }
    );
    expect(productUpdates[0]).toMatchObject({ seo_origin: "ai" });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.ids).toEqual([33]);
  });

  it("sets human when both accepted SEO fields are saved empty", async () => {
    const { client, productUpdates, marks } = updateClient([
      genRow({ id: 32, field: "seo_title", output: "Titel" }),
      genRow({ id: 33, field: "seo_description", output: "Beschreibung" }),
    ]);
    await saveProduct(client, 7, typed({ seoTitle: null }), {
      description: null,
      seoTitle: 32,
      seoDescription: 33,
    });
    expect(productUpdates[0]).toMatchObject({ seo_origin: "human" });
    expect(marks).toHaveLength(0);
  });

  it("fails the save when the audit lookup fails (R13)", async () => {
    const { client, productUpdates, marks } = updateClient(
      [genRow({ id: 31 })],
      {
        lookupError: true,
      }
    );
    const result = await saveProduct(
      client,
      7,
      typed({ description: "Vorschlag" }),
      { ...none, description: 31 }
    );
    expect(result.ok).toBe(false);
    expect(productUpdates).toHaveLength(0);
    expect(marks).toHaveLength(0);
  });

  it("ignores ids on create", async () => {
    const { client, select, inserts } = fakeClient([[], ["dachhaube"]]);
    await saveProduct(client, null, typed({ description: "Vorschlag" }), {
      ...none,
      description: 31,
    });
    // Only the two slug reads: no audit lookup, and a new product is human.
    expect(select).toHaveBeenCalledTimes(2);
    expect(inserts.at(-1)).toMatchObject({ description_origin: "human" });
  });

  it("does not fail the save when marking fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = updateClient([genRow({ id: 31 })], {
      markError: true,
    });
    const result = await saveProduct(
      client,
      7,
      typed({ description: "Vorschlag" }),
      { ...none, description: 31 }
    );
    expect(result).toEqual(ok({ id: 7 }));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

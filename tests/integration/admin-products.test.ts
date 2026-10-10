import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteProduct,
  getProductEditor,
  listProducts,
  saveProduct,
} from "@/lib/admin/products";
import { productSchema, emptyProductValues } from "@/lib/admin/schemas";
import {
  deleteProductsBySlugPrefix,
  deleteUser,
  sessionClient,
} from "./admin-session";

const ADMIN = "int-admin-products@example.test";
let admin: SupabaseClient<Database>;
const input = (patch: Record<string, string>) =>
  productSchema.parse({
    ...emptyProductValues(),
    categoryId: "1",
    name: "Int Teil",
    slug: "int-teil",
    ...patch,
  });

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await deleteProductsBySlugPrefix("int-");
  await deleteUser(ADMIN);
});

describe("listProducts (SC-5)", () => {
  it("includes drafts and filters by status and category", async () => {
    const drafts = await listProducts(admin, {
      categoryId: null,
      status: "draft",
      q: null,
    });
    expect(drafts.ok && drafts.value.map((p) => p.slug)).toContain(
      "entwurfsteil"
    );
    const cat2 = await listProducts(admin, {
      categoryId: 2,
      status: null,
      q: null,
    });
    expect(
      cat2.ok && cat2.value.every((p) => p.categorySlug === "sanitaer")
    ).toBe(true);
  });
  it("finds a product by article number and by name", async () => {
    const byNumber = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "99211/80",
    });
    expect(byNumber.ok && byNumber.value.map((p) => p.slug)).toEqual([
      "testrohrschelle",
    ]);
    const byName = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "testkeil",
    });
    expect(byName.ok && byName.value.map((p) => p.slug)).toEqual([
      "testkeil-mit-daempfung",
    ]);
  });
  it.each(["%", "_", "a,b", "x)", "(", "\\"])(
    "treats %s literally (Review Focus 1)",
    async (q) => {
      const result = await listProducts(admin, {
        categoryId: null,
        status: null,
        q,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  );
  it("counts articles", async () => {
    const r = await listProducts(admin, {
      categoryId: null,
      status: null,
      q: "testkeil",
    });
    expect(r.ok && r.value[0]?.articleCount).toBe(2);
  });
});

describe("saveProduct / deleteProduct", () => {
  it("creates a draft, maps a taken slug to a conflict and refuses publishing without articles", async () => {
    const created = await saveProduct(admin, null, input({}));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const dup = await saveProduct(admin, null, input({}));
    expect(dup).toEqual({
      ok: false,
      error: { kind: "conflict", field: "slug" },
    });
    const publish = await saveProduct(
      admin,
      created.value.id,
      input({ status: "published" })
    );
    expect(publish.ok).toBe(false);
    if (!publish.ok) expect(publish.error.kind).toBe("invalid");
    const editor = await getProductEditor(admin, created.value.id);
    expect(editor.ok && editor.value.product.status).toBe("draft");
    expect(await deleteProduct(admin, created.value.id)).toEqual({
      ok: true,
      value: null,
    });
  });
  it("refuses deleting a published product", async () => {
    const r = await deleteProduct(admin, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid");
  });
  it("returns not_found for a missing product", async () => {
    expect(await getProductEditor(admin, 999999)).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { deleteArticle, saveArticle } from "@/lib/admin/articles";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-articles@example.test";
let admin: SupabaseClient<Database>;
const input = {
  id: null,
  productId: 4,
  articleNumber: "INT-1",
  name: null,
  description: null,
  note: null,
  materialId: null,
  materialNote: null,
  sortOrder: 5,
  attributes: [],
  packaging: [],
};

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
  await admin.from("article").delete().eq("article_number", "INT-1");
});
afterAll(async () => {
  await admin.from("article").delete().eq("article_number", "INT-1");
  await deleteUser(ADMIN);
});

describe("articles", () => {
  it("maps a taken number to a field conflict", async () => {
    expect(
      await saveArticle(admin, { ...input, articleNumber: "99010" })
    ).toEqual({
      ok: false,
      error: { kind: "conflict", field: "articleNumber" },
    });
  });
  it("refuses deleting the last article of a published product", async () => {
    const r = await deleteArticle(admin, 3, 4); // product 3 "testabdeckung" has one article (id 4)
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid");
  });
  it("saves and deletes an article of a draft", async () => {
    const saved = await saveArticle(admin, input);
    expect(saved.ok).toBe(true);
    if (saved.ok)
      expect(await deleteArticle(admin, 4, saved.value.id)).toEqual({
        ok: true,
        value: null,
      });
  });
  it("returns not_found when the article is gone (Review Focus 5)", async () => {
    expect(await saveArticle(admin, { ...input, id: 999999 })).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteCategory,
  getCategory,
  saveCategory,
} from "@/lib/admin/categories";
import {
  categorySchema,
  emptyCategoryValues,
} from "@/lib/admin/category-schema";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-categories@example.test";
let admin: SupabaseClient<Database>;
const service = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

beforeAll(async () => {
  await service().from("category").delete().like("slug", "int-%");
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await service().from("category").delete().like("slug", "int-%");
  await deleteUser(ADMIN);
});

describe("categories (SC-10)", () => {
  it("creates, reads and deletes an empty category", async () => {
    const input = categorySchema.parse({
      ...emptyCategoryValues(),
      name: "Int Kategorie",
      slug: "int-kategorie",
      attributes: [{ attributeId: "1", sortOrder: "0" }],
    });
    const saved = await saveCategory(admin, null, input);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const read = await getCategory(admin, saved.value.id);
    expect(read.ok && read.value.values.attributes).toEqual([
      { attributeId: "1", sortOrder: "0" },
    ]);
    expect((await deleteCategory(admin, saved.value.id)).ok).toBe(true);
  });

  it("maps an attribute deleted in the meantime to a reload hint", async () => {
    const input = categorySchema.parse({
      ...emptyCategoryValues(),
      name: "Int Verwaist",
      slug: "int-verwaist",
      attributes: [{ attributeId: "999999", sortOrder: "0" }],
    });
    expect(await saveCategory(admin, null, input)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Eine Auswahl gibt es nicht mehr. Bitte die Seite neu laden.",
      },
    });
  });

  it("maps a taken slug and a used category", async () => {
    const input = categorySchema.parse({
      ...emptyCategoryValues(),
      name: "X",
      slug: "sanitaer",
    });
    expect(await saveCategory(admin, null, input)).toEqual({
      ok: false,
      error: { kind: "conflict", field: "slug" },
    });
    expect(await deleteCategory(admin, 1)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Die Kategorie enthält noch Produkte.",
      },
    });
  });
});

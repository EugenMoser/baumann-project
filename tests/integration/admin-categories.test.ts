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

  it("numbers a second category with the same name and keeps the slug on rename (6c SC-1)", async () => {
    const parse = (name: string) =>
      categorySchema.parse({ ...emptyCategoryValues(), name });
    const first = await saveCategory(admin, null, parse("Int Kategorie"));
    const second = await saveCategory(admin, null, parse("Int Kategorie"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const slugOf = async (id: number) => {
      const read = await getCategory(admin, id);
      return read.ok ? read.value.slug : undefined;
    };
    expect(await slugOf(first.value.id)).toBe("int-kategorie");
    expect(await slugOf(second.value.id)).toBe("int-kategorie-2");
    const renamed = await saveCategory(
      admin,
      second.value.id,
      parse("Int Umbenannt")
    );
    expect(renamed.ok).toBe(true);
    expect(await slugOf(second.value.id)).toBe("int-kategorie-2");
    expect((await getCategory(admin, second.value.id)).ok).toBe(true);
    expect((await deleteCategory(admin, first.value.id)).ok).toBe(true);
    expect((await deleteCategory(admin, second.value.id)).ok).toBe(true);
  });

  it("maps a used category", async () => {
    expect(await deleteCategory(admin, 1)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Die Kategorie enthält noch Produkte.",
      },
    });
  });
});

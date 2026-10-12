import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  listAccessories,
  resolveArticleNumbers,
  setAccessories,
} from "@/lib/admin/accessories";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-accessories@example.test";
let admin: SupabaseClient<Database>;

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  // Restore the seed: product 3 has article 2 as its only accessory.
  await setAccessories(admin, 3, [2]);
  await deleteUser(ADMIN);
});

describe("accessories (SC-9)", () => {
  it("resolves numbers exactly and saves the set in order", async () => {
    const resolved = await resolveArticleNumbers(admin, [
      "99211/80",
      "99010",
      "nope",
    ]);
    expect(resolved.ok && [...resolved.value.keys()].sort()).toEqual([
      "99010",
      "99211/80",
    ]);
    if (!resolved.ok) return;
    const saved = await setAccessories(admin, 3, [
      resolved.value.get("99211/80")!,
      resolved.value.get("99010")!,
    ]);
    expect(saved.ok).toBe(true);
    const list = await listAccessories(admin, 3);
    expect(list.ok && list.value.map((a) => a.articleNumber)).toEqual([
      "99211/80",
      "99010",
    ]);
  });

  it("resolves only the trimmed exact number, never a partial match", async () => {
    const resolved = await resolveArticleNumbers(admin, ["9901", "99010 "]);
    expect(resolved.ok && resolved.value.size).toBe(0);
  });

  it("maps an own article to the function message", async () => {
    const result = await setAccessories(admin, 3, [4]);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Artikel des eigenen Produkts sind kein Zubehör.",
      },
    });
  });
});

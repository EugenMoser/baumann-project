import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteColor,
  deleteMaterial,
  listColors,
  listMaterials,
  saveColor,
  saveMaterial,
} from "@/lib/admin/master-data";
import { colorSchema, materialSchema } from "@/lib/admin/master-schema";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-master@example.test";
let admin: SupabaseClient<Database>;
const service = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
const cleanup = async () => {
  await service().from("color").delete().like("name", "Int %");
  await service().from("material").delete().like("code", "INT-%");
};

beforeAll(async () => {
  await cleanup();
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await cleanup();
  await deleteUser(ADMIN);
});

describe("colours and materials (SC-11)", () => {
  it("creates and deletes an unused colour; refuses a used one", async () => {
    const input = colorSchema.parse({
      name: "Int Rot",
      ralReference: "",
      hexCode: "#aa0000",
      family: "rot",
    });
    expect((await saveColor(admin, null, input)).ok).toBe(true);
    const list = await listColors(admin);
    const created = list.ok
      ? list.value.find((c) => c.name === "Int Rot")
      : undefined;
    expect(created?.productCount).toBe(0);
    expect(created?.hexCode).toBe("#aa0000");
    expect((await deleteColor(admin, created!.id)).ok).toBe(true);
    expect(await deleteColor(admin, 1)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Die Farbe ist noch Produkten zugeordnet.",
      },
    });
  });

  it("maps a duplicate colour to a field conflict", async () => {
    const input = colorSchema.parse({
      name: "Int Doppelt",
      ralReference: "",
      hexCode: "#00aa00",
      family: "gruen",
    });
    expect((await saveColor(admin, null, input)).ok).toBe(true);
    expect(await saveColor(admin, null, input)).toEqual({
      ok: false,
      error: { kind: "conflict", field: "name" },
    });
  });

  it("maps a taken code and a used material", async () => {
    expect(
      await saveMaterial(
        admin,
        null,
        materialSchema.parse({ code: "POM", name: "Doppelt" })
      )
    ).toEqual({
      ok: false,
      error: { kind: "conflict", field: "code" },
    });
    expect(await deleteMaterial(admin, 1)).toEqual({
      ok: false,
      error: { kind: "invalid", message: "Das Material wird noch verwendet." },
    });
    const list = await listMaterials(admin);
    expect(
      list.ok && list.value.find((m) => m.code === "PA-6")?.productCount
    ).toBe(1);
  });
});

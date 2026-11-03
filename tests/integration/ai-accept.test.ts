import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { saveProduct } from "@/lib/admin/products";
import { emptyProductValues, productSchema } from "@/lib/admin/schemas";
import {
  deleteProductsBySlugPrefix,
  deleteUser,
  sessionClient,
} from "./admin-session";

const ADMIN = "int-ai-accept@example.test";
const NO_IDS = { description: null, seoTitle: null, seoDescription: null };
let admin: SupabaseClient<Database>;
let productId: number;
const generationIds: number[] = [];

const input = (patch: Record<string, string>) =>
  productSchema.parse({
    ...emptyProductValues(),
    categoryId: "1",
    name: "Int KI Teil",
    ...patch,
  });

async function suggestion(
  field: "description" | "seo_title" | "seo_description",
  output: string,
  createdAt?: string
): Promise<number> {
  const { data, error } = await admin
    .from("ai_generation")
    .insert({
      entity: "product",
      entity_id: productId,
      field,
      model: "fake",
      prompt_version: "test",
      output,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert failed: ${error.code}`);
  generationIds.push(data.id);
  return data.id;
}

async function acceptedAt(id: number): Promise<string | null | undefined> {
  const { data } = await admin
    .from("ai_generation")
    .select("accepted_at")
    .eq("id", id)
    .single();
  return data?.accepted_at;
}

async function descriptionOrigin(): Promise<string | undefined> {
  const { data } = await admin
    .from("product")
    .select("description_origin")
    .eq("id", productId)
    .single();
  return data?.description_origin;
}

beforeAll(async () => {
  // Self-heal: remove leftovers of an aborted earlier run.
  await deleteProductsBySlugPrefix("int-");
  admin = await sessionClient(ADMIN, true);
  const created = await saveProduct(admin, null, input({}));
  if (!created.ok) throw new Error("setup failed");
  productId = created.value.id;
});
afterAll(async () => {
  if (generationIds.length > 0)
    await admin.from("ai_generation").delete().in("id", generationIds);
  await deleteProductsBySlugPrefix("int-");
  await deleteUser(ADMIN);
});

describe("accepted suggestions on save (SC-6)", () => {
  it("sets the origin and accepted_at in one save", async () => {
    const id = await suggestion("description", "Vorschlag der KI");
    const saved = await saveProduct(
      admin,
      productId,
      input({ description: "Vorschlag der KI" }),
      { ...NO_IDS, description: id }
    );
    expect(saved.ok).toBe(true);
    expect(await descriptionOrigin()).toBe("ai");
    expect(await acceptedAt(id)).not.toBeNull();
  });

  it("ignores an accepted row on a second save", async () => {
    const id = await suggestion("description", "Zweiter Vorschlag");
    await saveProduct(
      admin,
      productId,
      input({ description: "Zweiter Vorschlag" }),
      { ...NO_IDS, description: id }
    );
    const first = await acceptedAt(id);
    // Same id again with other text: reused, so only the plain rule applies.
    await saveProduct(admin, productId, input({ description: "Ganz anders" }), {
      ...NO_IDS,
      description: id,
    });
    expect(await descriptionOrigin()).toBe("ai_edited");
    expect(await acceptedAt(id)).toBe(first);
  });

  it("ignores a stale row and leaves it unaccepted", async () => {
    // An emptied description resets the origin to human.
    await saveProduct(admin, productId, input({}));
    const stale = await suggestion(
      "description",
      "Alter Text",
      new Date(Date.now() - 25 * 3_600_000).toISOString()
    );
    await saveProduct(admin, productId, input({ description: "Alter Text" }), {
      ...NO_IDS,
      description: stale,
    });
    expect(await descriptionOrigin()).toBe("human");
    expect(await acceptedAt(stale)).toBeNull();
  });

  it("ignores a row of another field", async () => {
    const wrong = await suggestion("seo_title", "Titel");
    await saveProduct(admin, productId, input({ description: "Titel" }), {
      ...NO_IDS,
      description: wrong,
    });
    expect(await acceptedAt(wrong)).toBeNull();
  });
});

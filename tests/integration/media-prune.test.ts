import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runPruneCli } from "../../scripts/media/prune.mts";
import { makePng } from "../fixtures/images";

const svc = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

const run = (argv: string[]) =>
  runPruneCli(argv, {
    log: () => undefined,
    error: () => undefined,
    env: process.env,
  });

const tag = `int-prune-${Date.now()}`;
const created = { files: [] as string[], categoryId: 0, productId: 0 };

async function putFile(path: string, contentType: string, body: Uint8Array) {
  const { error } = await svc()
    .storage.from("catalog")
    .upload(path, body, { contentType });
  expect(error).toBeNull();
  created.files.push(path);
}

async function exists(path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const { data } = await svc().storage.from("catalog").list(dir);
  return (data ?? []).some((o) => o.name === path.split("/").pop());
}

async function rowCount(path: string): Promise<number> {
  const { data } = await svc()
    .from("media")
    .select("id")
    .eq("storage_path", path);
  return data?.length ?? 0;
}

afterEach(async () => {
  const client = svc();
  await client.from("media").delete().like("storage_path", `%${tag}%`);
  if (created.productId)
    await client.from("product").delete().eq("id", created.productId);
  if (created.categoryId)
    await client.from("category").delete().eq("id", created.categoryId);
  if (created.files.length > 0)
    await client.storage.from("catalog").remove(created.files);
  created.files = [];
  created.categoryId = 0;
  created.productId = 0;
});

describe("media:prune (SC-7)", () => {
  it("removes only unlinked rows and their files, and only with --apply", async () => {
    const png = makePng(2, 2);
    const orphanRowPath = `products/${tag}/unlinked.png`;
    const linkedPath = `products/${tag}/linked.png`;
    const youngPath = `products/${tag}/young-orphan.png`;
    const certPath = `certificates/${tag}.txt`;
    for (const p of [orphanRowPath, linkedPath, youngPath])
      await putFile(p, "image/png", png);
    await putFile(certPath, "text/plain", new TextEncoder().encode("x"));

    const db = svc();
    const cat = await db
      .from("category")
      .insert({ slug: tag, name: tag })
      .select("id")
      .single();
    expect(cat.error).toBeNull();
    created.categoryId = cat.data?.id ?? 0;
    const prod = await db
      .from("product")
      .insert({ category_id: created.categoryId, slug: tag, name: tag })
      .select("id")
      .single();
    expect(prod.error).toBeNull();
    created.productId = prod.data?.id ?? 0;
    for (const p of [orphanRowPath, linkedPath]) {
      const { error } = await db
        .from("media")
        .insert({ storage_path: p, width: 2, height: 2, alt_text: "x" });
      expect(error).toBeNull();
    }
    const linked = await db
      .from("media")
      .select("id")
      .eq("storage_path", linkedPath)
      .single();
    const link = await db.from("product_media").insert({
      product_id: created.productId,
      media_id: linked.data?.id ?? 0,
      role: "thumbnail",
    });
    expect(link.error).toBeNull();

    // Default run deletes nothing.
    expect(await run([])).toBe(0);
    expect(await rowCount(orphanRowPath)).toBe(1);
    expect(await exists(orphanRowPath)).toBe(true);

    expect(await run(["--apply"])).toBe(0);
    expect(await rowCount(orphanRowPath)).toBe(0);
    expect(await exists(orphanRowPath)).toBe(false);
    expect(await rowCount(linkedPath)).toBe(1);
    expect(await exists(linkedPath)).toBe(true);
    expect(await exists(youngPath)).toBe(true);
    expect(await exists(certPath)).toBe(true);
  });
});

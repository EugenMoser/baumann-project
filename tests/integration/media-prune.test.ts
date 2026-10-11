import { describe, expect, it } from "vitest";
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

describe("media:prune (SC-7)", () => {
  it("removes an unlinked row and its file with --apply", async () => {
    const path = `products/int-prune/${Date.now()}.png`;
    const up = await svc()
      .storage.from("catalog")
      .upload(path, makePng(2, 2), { contentType: "image/png" });
    expect(up.error).toBeNull();
    const { error } = await svc()
      .from("media")
      .insert({ storage_path: path, width: 2, height: 2, alt_text: "x" });
    expect(error).toBeNull();
    const logs: string[] = [];
    const code = await runPruneCli(["--apply"], {
      log: (m) => logs.push(m),
      error: (m) => logs.push(m),
      env: process.env,
    });
    expect(code).toBe(0);
    const { data } = await svc()
      .from("media")
      .select("id")
      .eq("storage_path", path);
    expect(data).toEqual([]);
    const listed = await svc()
      .storage.from("catalog")
      .list("products/int-prune");
    expect(listed.data?.map((o) => o.name)).not.toContain(
      path.split("/").pop()
    );
  });
});

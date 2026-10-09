import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runImportCli } from "../../scripts/import/cli.mts";
import { listObjects } from "../../scripts/import/images.mts";
import {
  FIXTURE_IMAGES,
  copyFixtureSnapshot,
  importEnv,
  resetDatabase,
  serviceClient,
  silentIo,
  startImageServer,
  tableCounts,
} from "./import-helpers";

const PATHS = [
  "products/halterung/testhalter/a-98020-testhalter.webp",
  "products/moebel/testkeil-mit-daempfung/a-98010-testkeil.webp",
  "products/moebel/testkeil-mit-daempfung/b1-98010-testkeil.webp",
];

let server: Awaited<ReturnType<typeof startImageServer>>;
const client = serviceClient();
const bucket = () => client.storage.from("catalog");

async function storedPaths(): Promise<string[]> {
  const listed = await listObjects(bucket(), "products");
  if (!listed.ok) throw new Error(listed.error);
  return [...listed.value].sort();
}

beforeAll(async () => {
  server = await startImageServer(FIXTURE_IMAGES);
});

afterAll(async () => {
  await server.close();
  const listed = await listObjects(bucket(), "products");
  if (listed.ok && listed.value.length > 0) await bucket().remove(listed.value);
  await resetDatabase();
});

describe("catalog:import (FR-1, FR-8, SC-1, SC-8)", () => {
  it("refuses to run without valid env", async () => {
    const before = await tableCounts();
    const io = silentIo({
      ...importEnv(server.baseUrl),
      IMPORT_SUPABASE_SECRET_KEY: "sb_publishable_x",
    });
    expect(
      await runImportCli(["--snapshot", await copyFixtureSnapshot()], io)
    ).toBe(1);
    expect(await tableCounts()).toEqual(before);
  });

  it("prints usage without --snapshot", async () => {
    expect(await runImportCli([], silentIo(importEnv(server.baseUrl)))).toBe(2);
  });

  it("dry run writes the report and changes nothing", async () => {
    const dir = await copyFixtureSnapshot();
    const before = await tableCounts();
    const code = await runImportCli(
      ["--", "--snapshot", dir, "--dry-run"],
      silentIo(importEnv(server.baseUrl))
    );
    expect(code).toBe(0);
    expect(await tableCounts()).toEqual(before);
    expect(await storedPaths()).toEqual([]);
    const report = await readFile(join(dir, "import-report.md"), "utf8");
    expect(report).toContain("- Mode: dry run");
    expect(report).toContain("## Unparsed attribute values");
  });

  it("aborts on an empty collection without writing", async () => {
    const dir = await copyFixtureSnapshot();
    await writeFile(join(dir, "articles.json"), "[]");
    const before = await tableCounts();
    expect(
      await runImportCli(
        ["--snapshot", dir],
        silentIo(importEnv(server.baseUrl))
      )
    ).toBe(1);
    expect(await tableCounts()).toEqual(before);
  });

  it("aborts on a missing image, writes the report and changes nothing", async () => {
    const dir = await copyFixtureSnapshot();
    const products = JSON.parse(
      await readFile(join(dir, "products.json"), "utf8")
    );
    products[2].imageUrls_small = ["/a_98030-Fehlt.webp"];
    await writeFile(join(dir, "products.json"), JSON.stringify(products));
    const before = await tableCounts();
    expect(
      await runImportCli(
        ["--snapshot", dir],
        silentIo(importEnv(server.baseUrl))
      )
    ).toBe(1);
    expect(await tableCounts()).toEqual(before);
    const report = await readFile(join(dir, "import-report.md"), "utf8");
    expect(report).toContain("## Failed image downloads");
    expect(report).toContain("a-98030-fehlt.webp");
  });

  it("aborts when the database rejects the payload, then succeeds on a re-run (Review Focus 4)", async () => {
    const { data: category } = await client
      .from("category")
      .insert({ slug: "moebel", name: "Möbel" })
      .select("id")
      .single();
    expect(category).not.toBeNull();
    const blocker = await client
      .from("product")
      .insert({
        category_id: category?.id ?? 0,
        slug: "testkeil-mit-daempfung",
        name: "Blocker",
      })
      .select("id")
      .single();
    expect(blocker.error).toBeNull();
    const before = await tableCounts();
    const dir = await copyFixtureSnapshot();
    const io = silentIo(importEnv(server.baseUrl));
    expect(await runImportCli(["--snapshot", dir], io)).toBe(1);
    expect(await tableCounts()).toEqual(before);
    expect(await readFile(join(dir, "import-report.md"), "utf8")).toContain(
      "- Outcome: aborted"
    );

    await client
      .from("product")
      .delete()
      .eq("id", blocker.data?.id ?? 0);
    expect(
      await runImportCli(
        ["--snapshot", dir],
        silentIo(importEnv(server.baseUrl))
      )
    ).toBe(0);
    expect(await storedPaths()).toEqual(PATHS);
  });
});

describe("catalog:import result (FR-7, FR-9, SC-7, SC-8)", () => {
  it("imports products, articles, colours and images", async () => {
    const io = silentIo(importEnv(server.baseUrl));
    expect(
      await runImportCli(["--snapshot", await copyFixtureSnapshot()], io)
    ).toBe(0);
    expect(io.lines.join("\n")).toContain("products: 3");

    const { data: products } = await client
      .from("product")
      .select("legacy_product_id, slug, status")
      .not("legacy_product_id", "is", null)
      .order("legacy_product_id");
    expect(products).toEqual([
      {
        legacy_product_id: 9001,
        slug: "testkeil-mit-daempfung",
        status: "published",
      },
      { legacy_product_id: 9002, slug: "testhalter", status: "published" },
      { legacy_product_id: 9003, slug: "testsiphon", status: "published" },
    ]);
    const { data: media } = await client
      .from("media")
      .select("storage_path, width, height")
      .like("storage_path", "products/%/%/%")
      .order("storage_path");
    expect(media).toEqual([
      { storage_path: PATHS[0], width: 50, height: 50 },
      { storage_path: PATHS[1], width: 40, height: 30 },
      { storage_path: PATHS[2], width: 80, height: 60 },
    ]);
    expect(await storedPaths()).toEqual(PATHS);
    const { data: variants } = await client
      .from("variant")
      .select("order_number")
      .like("order_number", "98010%")
      .order("order_number");
    expect(variants?.map((v) => v.order_number)).toEqual([
      "98010 - 0",
      "98010 - 1",
      "98010 - 2",
    ]);
  });
});

describe("re-import semantics (FR-10, SC-10)", () => {
  it("keeps owned-elsewhere fields, restores imported fields, keeps ids and removes orphans", async () => {
    const dir = await copyFixtureSnapshot();
    expect(
      await runImportCli(
        ["--snapshot", dir],
        silentIo(importEnv(server.baseUrl))
      )
    ).toBe(0);
    const { data: before } = await client
      .from("product")
      .select("id, legacy_product_id")
      .not("legacy_product_id", "is", null)
      .order("legacy_product_id");

    await client
      .from("product")
      .update({ status: "archived", name: "Verändert" })
      .eq("legacy_product_id", 9001);
    await client
      .from("category")
      .update({ intro_text: "Redaktioneller Text." })
      .eq("slug", "moebel");
    await bucket().upload(
      "products/moebel/alt/verwaist.webp",
      FIXTURE_IMAGES.get("a_98010-Testkeil.webp") ?? Buffer.alloc(0),
      { upsert: true, contentType: "image/webp" }
    );

    expect(
      await runImportCli(
        ["--snapshot", dir],
        silentIo(importEnv(server.baseUrl))
      )
    ).toBe(0);

    const { data: after } = await client
      .from("product")
      .select("id, legacy_product_id")
      .not("legacy_product_id", "is", null)
      .order("legacy_product_id");
    expect(after).toEqual(before);
    const { data: keil } = await client
      .from("product")
      .select("status, name")
      .eq("legacy_product_id", 9001)
      .single();
    expect(keil).toEqual({ status: "archived", name: "Testkeil mit Dämpfung" });
    const { data: moebel } = await client
      .from("category")
      .select("intro_text")
      .eq("slug", "moebel")
      .single();
    expect(moebel?.intro_text).toBe("Redaktioneller Text.");
    expect(await storedPaths()).toEqual(PATHS);
  });
});

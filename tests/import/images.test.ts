// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  deleteOrphans,
  fetchImages,
  listObjects,
  uploadImages,
  type StorageBucket,
} from "../../scripts/import/images.mts";
import { makePng } from "./png";

const job = (name: string) => ({
  url: `https://cdn.test/${name}`,
  storagePath: `products/moebel/p/${name}`,
  contentType: "image/webp",
});

const fakeFetch =
  (routes: Record<string, Response | Error>): typeof fetch =>
  async (input) => {
    const route = routes[String(input)];
    if (route instanceof Error) throw route;
    return route ?? new Response("not found", { status: 404 });
  };

function fakeBucket(files: string[]) {
  const uploads: string[] = [];
  const removed: string[] = [];
  const bucket: StorageBucket = {
    async upload(path) {
      uploads.push(path);
      return { error: null };
    },
    async list(prefix) {
      const children = new Map<string, boolean>();
      for (const file of files) {
        if (!file.startsWith(`${prefix}/`)) continue;
        const [head, ...rest] = file.slice(prefix.length + 1).split("/");
        if (head !== undefined) children.set(head, rest.length > 0);
      }
      return {
        data: [...children].map(([name, isFolder]) => ({
          name,
          id: isFolder ? null : `id-${name}`,
        })),
        error: null,
      };
    },
    async remove(paths) {
      removed.push(...paths);
      return { error: null };
    },
  };
  return { bucket, uploads, removed };
}

describe("fetchImages (FR-7, FR-8)", () => {
  it("reads dimensions and collects failures", async () => {
    const result = await fetchImages(
      [job("a.webp"), job("b.webp"), job("c.webp"), job("d.webp")],
      fakeFetch({
        "https://cdn.test/a.webp": new Response(makePng(40, 30)),
        "https://cdn.test/c.webp": new Response("not an image"),
        "https://cdn.test/d.webp": new Error("socket hang up"),
      })
    );
    expect(
      result.fetched.map((f) => [f.storagePath, f.width, f.height])
    ).toEqual([["products/moebel/p/a.webp", 40, 30]]);
    expect(result.failures).toEqual([
      {
        url: "https://cdn.test/b.webp",
        storagePath: "products/moebel/p/b.webp",
        reason: "HTTP 404",
      },
      expect.objectContaining({ storagePath: "products/moebel/p/c.webp" }),
      {
        url: "https://cdn.test/d.webp",
        storagePath: "products/moebel/p/d.webp",
        reason: "socket hang up",
      },
    ]);
  });

  it("gives up on a hanging request after the timeout", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("timed out"))
        );
      });
    const result = await fetchImages([job("a.webp")], hanging, {
      timeoutMs: 50,
    });
    expect(result.failures).toHaveLength(1);
  });
});

describe("uploadImages", () => {
  it("uploads every image", async () => {
    const { bucket, uploads } = fakeBucket([]);
    const result = await uploadImages(bucket, [
      { ...job("a.webp"), bytes: makePng(1, 1), width: 1, height: 1 },
    ]);
    expect(result).toEqual({ ok: true, value: 1 });
    expect(uploads).toEqual(["products/moebel/p/a.webp"]);
  });
});

describe("listObjects and deleteOrphans", () => {
  const files = [
    "products/moebel/p/a.webp",
    "products/moebel/p/old.webp",
    "products/wasser/q/b.webp",
  ];

  it("lists nested folders", async () => {
    const { bucket } = fakeBucket(files);
    const result = await listObjects(bucket, "products");
    expect(result.ok && [...result.value].sort()).toEqual([...files].sort());
  });

  it("deletes only objects that are not kept", async () => {
    const { bucket, removed } = fakeBucket(files);
    const result = await deleteOrphans(
      bucket,
      new Set(["products/moebel/p/a.webp", "products/wasser/q/b.webp"])
    );
    expect(result).toEqual({ ok: true, value: 1 });
    expect(removed).toEqual(["products/moebel/p/old.webp"]);
  });
});

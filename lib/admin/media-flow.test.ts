import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { UPLOAD_FAILED } from "./errors";
import {
  newImagePath,
  removeFiles,
  storeImage,
  type MediaStorage,
} from "./media-flow";
import { adminWrite } from "./write";

const image = {
  extension: "png",
  contentType: "image/png",
  width: 40,
  height: 30,
} as const;
const bytes = new Uint8Array([1, 2, 3]);

function fakeStorage(overrides: Partial<MediaStorage> = {}) {
  const upload = vi.fn<MediaStorage["upload"]>(async () => ({ error: null }));
  const remove = vi.fn<MediaStorage["remove"]>(async () => ({ error: null }));
  return { upload, remove, ...overrides };
}

describe("newImagePath (D1)", () => {
  it("builds products/{id}/{uuid}.{ext}", () => {
    expect(newImagePath(7, "webp", "abc")).toBe("products/7/abc.webp");
  });
});

describe("storeImage (SC-2)", () => {
  it("uploads without upsert, then attaches", async () => {
    const storage = fakeStorage();
    const attach = vi.fn(async () => ok(11));
    const result = await storeImage(
      { storage, attach, uuid: () => "u1", log: vi.fn() },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(ok(11));
    expect(storage.upload).toHaveBeenCalledWith("products/3/u1.png", bytes, {
      upsert: false,
      contentType: "image/png",
    });
    expect(attach).toHaveBeenCalledWith({
      productId: 3,
      storagePath: "products/3/u1.png",
      width: 40,
      height: 30,
      altText: "Bild",
    });
  });

  it("does not attach when the upload fails", async () => {
    const storage = fakeStorage({
      upload: vi.fn(async () => ({ error: { message: "boom" } })),
    });
    const attach = vi.fn(async () => ok(11));
    const log = vi.fn();
    const result = await storeImage(
      { storage, attach, uuid: () => "u1", log },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(err({ kind: "invalid", message: UPLOAD_FAILED }));
    expect(attach).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[admin] upload image", "boom");
  });

  it("removes the uploaded file when attaching fails", async () => {
    const storage = fakeStorage();
    const failure = err({ kind: "db_error" as const, code: "XX000" });
    const result = await storeImage(
      {
        storage,
        attach: vi.fn(async () => failure),
        uuid: () => "u1",
        log: vi.fn(),
      },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(failure);
    expect(storage.remove).toHaveBeenCalledWith(["products/3/u1.png"]);
  });
});

describe("removeFiles (SC-6)", () => {
  it("skips an empty list", async () => {
    const storage = fakeStorage();
    await removeFiles(storage, [], vi.fn());
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("logs a failed removal without throwing", async () => {
    const storage = fakeStorage({
      remove: vi.fn(async () => ({ error: { message: "gone" } })),
    });
    const log = vi.fn();
    await expect(
      removeFiles(storage, ["products/1/a.png"], log)
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[admin] remove files", "gone");
  });
});

describe("remove flow through adminWrite (SC-6, SC-13)", () => {
  it("revalidates after the row is gone even if the file removal fails", async () => {
    const revalidate = vi.fn();
    const log = vi.fn();
    const storage = fakeStorage({
      remove: vi.fn(async () => ({ error: { message: "x" } })),
    });
    const outcome = await adminWrite(
      {
        check: async () => ({
          kind: "admin" as const,
          userId: "u1",
          email: "a@example.test",
        }),
        revalidate,
        logError: vi.fn(),
      },
      "[admin] remove image",
      async () => {
        const path = "products/1/a.png";
        await removeFiles(storage, [path], log);
        return ok(path);
      }
    );
    expect(outcome).toEqual({ kind: "done", result: ok("products/1/a.png") });
    expect(revalidate).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[admin] remove files", "x");
  });
});

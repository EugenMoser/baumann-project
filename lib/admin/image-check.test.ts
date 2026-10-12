import { describe, expect, it } from "vitest";
import {
  gifHeader,
  jpegHeader,
  makePng,
  webpHeader,
} from "@/tests/fixtures/images";
import { checkImage, IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "./image-check";

describe("checkImage (SC-1)", () => {
  it("accepts PNG, JPEG and WebP with their dimensions", () => {
    expect(checkImage(makePng(40, 30))).toEqual({
      ok: true,
      value: {
        extension: "png",
        contentType: "image/png",
        width: 40,
        height: 30,
      },
    });
    expect(checkImage(jpegHeader(640, 480))).toMatchObject({
      ok: true,
      value: {
        extension: "jpg",
        contentType: "image/jpeg",
        width: 640,
        height: 480,
      },
    });
    expect(checkImage(webpHeader(300, 200))).toMatchObject({
      ok: true,
      value: {
        extension: "webp",
        contentType: "image/webp",
        width: 300,
        height: 200,
      },
    });
  });

  it("rejects an empty file", () => {
    expect(checkImage(new Uint8Array())).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.missing,
    });
  });

  it("rejects a file over 5 MiB", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(makePng(1, 1));
    expect(checkImage(big)).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.tooLarge,
    });
  });

  it("rejects GIF and text renamed to .jpg", () => {
    expect(checkImage(gifHeader())).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.type,
    });
    expect(checkImage(new TextEncoder().encode("not an image"))).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.type,
    });
  });

  it("rejects an image wider than 8000 px", () => {
    expect(checkImage(makePng(8001, 1))).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.dimensions,
    });
  });
});

import { describe, expect, it } from "vitest";
import { NEEDS_ONE_THUMBNAIL } from "./errors";
import { IMAGE_MESSAGES } from "./image-check";
import type { MediaItem } from "./media";
import {
  parseMedia,
  parseUploadMeta,
  readUpload,
  withAltOrigins,
} from "./media-schema";

const item = (patch: Partial<MediaItem>): MediaItem => ({
  mediaId: 1,
  storagePath: "products/1/a.png",
  width: 10,
  height: 10,
  altText: "Alt",
  altOrigin: "human",
  isThumbnail: true,
  sortOrder: 0,
  ...patch,
});

describe("readUpload (Review Focus 1)", () => {
  it("treats an empty file part as no file", () => {
    const fd = new FormData();
    fd.set("productId", "3");
    fd.set("altText", "Bild");
    fd.set("file", new File([], ""));
    expect(readUpload(fd).file).toBeNull();
  });

  it("returns a chosen file", () => {
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1])], "a.png"));
    expect(readUpload(fd).file?.name).toBe("a.png");
  });
});

describe("parseUploadMeta (SC-1)", () => {
  it("trims the alt text", () => {
    expect(parseUploadMeta({ productId: "3", altText: " Bild " })).toEqual({
      ok: true,
      value: { productId: 3, altText: "Bild" },
    });
  });
  it("rejects an empty or over-long alt text", () => {
    expect(parseUploadMeta({ productId: "3", altText: "  " })).toMatchObject({
      ok: false,
      fieldErrors: { altText: "Bitte einen Alt-Text eingeben." },
    });
    expect(
      parseUploadMeta({ productId: "3", altText: "x".repeat(251) })
    ).toMatchObject({
      ok: false,
      fieldErrors: { altText: "Höchstens 250 Zeichen." },
    });
  });
  it("exposes the missing-file message for the action", () => {
    expect(IMAGE_MESSAGES.missing).toBe("Bitte eine Bilddatei wählen.");
  });
});

describe("parseMedia (SC-4)", () => {
  it("keeps the display order and marks one thumbnail", () => {
    const result = parseMedia({
      productId: "3",
      rows: [
        { mediaId: "8", altText: "B" },
        { mediaId: "7", altText: "A" },
      ],
      thumbnailId: "7",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        productId: 3,
        rows: [
          { mediaId: 8, altText: "B", isThumbnail: false },
          { mediaId: 7, altText: "A", isThumbnail: true },
        ],
      },
    });
  });
  it("reports an empty alt text per row and a missing thumbnail", () => {
    const result = parseMedia({
      productId: "3",
      rows: [{ mediaId: "8", altText: " " }],
      thumbnailId: "",
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        "rows.0.altText": "Bitte einen Alt-Text eingeben.",
        media: NEEDS_ONE_THUMBNAIL,
      },
    });
  });
});

describe("withAltOrigins (SC-4, origin rule)", () => {
  const rows = (altText: string) => [
    { mediaId: 1, altText, isThumbnail: true },
  ];
  it.each([
    ["human", "Alt", "human"],
    ["human", "Neu", "human"],
    ["ai", "Alt", "ai"],
    ["ai", "Neu", "ai_edited"],
    ["ai_edited", "Neu", "ai_edited"],
  ] as const)("%s + %s → %s", (prev, text, expected) => {
    expect(
      withAltOrigins([item({ altOrigin: prev })], rows(text))[0]?.altOrigin
    ).toBe(expected);
  });
});

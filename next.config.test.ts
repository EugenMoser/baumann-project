import { describe, expect, it } from "vitest";
// Internal Next API: re-check the path and signature on Next bumps.
import { matchRemotePattern } from "next/dist/shared/lib/match-remote-pattern";
import { publicMediaUrl } from "@/lib/catalog/media";

// next.config.ts validates the env at import; vitest.config.ts provides it.
async function loadImages() {
  const { default: config } = await import("./next.config");
  const images = config.images;
  if (!images) throw new Error("images config missing");
  return images;
}

async function loadPattern() {
  const { remotePatterns } = await loadImages();
  const [pattern] = remotePatterns ?? [];
  if (!pattern) throw new Error("remotePatterns entry missing");
  return pattern;
}

describe("next.config image optimizer (audit: cache busting)", () => {
  it("rejects remote image URLs that carry a query string", async () => {
    const { remotePatterns } = await loadImages();
    expect(remotePatterns).toHaveLength(1);
    expect(remotePatterns?.[0]?.search).toBe("");
  });

  it("caps the optimizer disk cache at 500 MB", async () => {
    const images = await loadImages();
    expect(images.maximumDiskCacheSize).toBe(500_000_000);
  });

  it("matches a catalog image URL without a query string", async () => {
    const pattern = await loadPattern();
    const url = new URL(publicMediaUrl("products/42/dachhaube.jpg"));
    expect(matchRemotePattern(pattern, url)).toBe(true);
  });

  it("does not match the same catalog image URL with ?v=1", async () => {
    const pattern = await loadPattern();
    const url = new URL(`${publicMediaUrl("products/42/dachhaube.jpg")}?v=1`);
    expect(matchRemotePattern(pattern, url)).toBe(false);
  });
});

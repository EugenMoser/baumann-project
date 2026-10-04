import { expect, test } from "@playwright/test";

const MISSING_PATH = "/diese-seite-gibt-es-nicht";

test.describe("noindex", () => {
  for (const path of ["/", MISSING_PATH]) {
    test(`meta robots noindex, nofollow on ${path} (SC-2)`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      if (path === MISSING_PATH) {
        expect(response?.status()).toBe(404);
      }
      // Next's built-in 404 adds its own `noindex` tag next to ours, so
      // collect every robots meta tag instead of assuming exactly one.
      const contents = await page
        .locator('meta[name="robots"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("content") ?? "")
        );
      expect(contents.length).toBeGreaterThan(0);
      for (const content of contents) {
        expect(content).toMatch(/\bnoindex\b/);
      }
      expect(
        contents.some(
          (content) =>
            /\bnoindex\b/.test(content) && /\bnofollow\b/.test(content)
        ),
        "one single robots meta must carry both noindex and nofollow"
      ).toBe(true);
    });
  }

  test("X-Robots-Tag on pages, metadata routes and static assets (SC-3)", async ({
    page,
    request,
  }) => {
    for (const url of ["/", MISSING_PATH, "/robots.txt", "/favicon.ico"]) {
      const response = await request.get(url);
      expect(response.headers()["x-robots-tag"], url).toBe("noindex, nofollow");
    }

    await page.goto("/");
    const scriptSrc = await page
      .locator('script[src^="/_next/static/"]')
      .first()
      .getAttribute("src");
    if (scriptSrc === null) {
      throw new Error("No /_next/static script found on the home page");
    }
    const asset = await request.get(scriptSrc);
    expect(asset.headers()["x-robots-tag"], scriptSrc).toBe(
      "noindex, nofollow"
    );
  });

  test("robots.txt disallows all crawlers (SC-4)", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/^User-Agent: \*$/im);
    expect(body).toMatch(/^Disallow: \/$/m);
  });
});

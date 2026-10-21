import { expect, test } from "@playwright/test";

import { PAGES } from "./pages";

test.use({ viewport: { width: 360, height: 740 } });

test.describe("responsive layout at 360 px", () => {
  for (const path of PAGES) {
    test(`has no horizontal page overflow on ${path} (SC-6)`, async ({
      page,
    }) => {
      await page.goto(path);
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      expect(scrollWidth).toBeLessThanOrEqual(360);
    });
  }

  test("scrolls the article table inside its own region (SC-6)", async ({
    page,
  }) => {
    await page.goto("/produkte/moebelteile/testkeil-mit-daempfung");
    const region = page.getByRole("region", {
      name: "Artikel von Testkeil mit Dämpfung",
    });
    await expect(region).toBeVisible();
    const { scrollWidth, clientWidth } = await region.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});

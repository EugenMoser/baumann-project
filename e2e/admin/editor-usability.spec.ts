import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });

// Product 1 and category 1 come from the seed: the product has articles,
// colours, images and accessories, so every editor section is on the page.
const PAGES = ["/admin/produkte/1", "/admin/kategorien/1"] as const;

for (const width of [390, 360]) {
  for (const path of PAGES) {
    test(`${path} does not scroll horizontally at ${width} px (6c SC-6)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        // Only for the failure message: elements inside a scroll container
        // (e.g. the table wrapper) may be wider without widening the page.
        const inScroller = (el: Element) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (["auto", "scroll"].includes(getComputedStyle(p).overflowX))
              return true;
          }
          return false;
        };
        const wide = [...document.body.querySelectorAll("*")]
          .filter((el) => !inScroller(el))
          .map((el) => ({ el, right: el.getBoundingClientRect().right }))
          .filter(({ right }) => right > root.clientWidth + 0.5)
          .map(
            ({ el, right }) =>
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(right)}`
          );
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          wide: wide.slice(0, 15),
        };
      });
      expect(
        overflow.scrollWidth,
        `elements past the right edge:\n${overflow.wide.join("\n")}`
      ).toBeLessThanOrEqual(overflow.clientWidth);
    });
  }
}

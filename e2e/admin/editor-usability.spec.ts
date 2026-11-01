import { expect, test, type Page } from "@playwright/test";
import {
  createProductWithTwoColors,
  createPublishedProduct,
  dragHandleWithMouse,
  dragHandleWithTouch,
  STORAGE_STATE,
} from "./support";

test.use({ storageState: STORAGE_STATE });

const run = Date.now().toString(36);
const HELP_TEXT =
  "Die Standardfarbe ist auf der Produktseite vorausgewählt. Ihre Bestellnummer steht im Auswahlblock, bis jemand eine andere Farbe wählt.";

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

test.describe("slugs and SEO section", () => {
  test.describe.configure({ mode: "serial" });

  test("a second product with the same name gets a numbered address; renaming keeps it (6c SC-1)", async ({
    page,
  }) => {
    const name = `E2E Doppelt ${run}`;
    const create = async () => {
      await page.goto("/admin/produkte/neu");
      await page
        .getByLabel("Kategorie")
        .selectOption({ label: "Möbelteile (Beispiel)" });
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Produkt anlegen" }).click();
      await expect(page).toHaveURL(/\/admin\/produkte\/\d+$/);
    };
    await create();
    await expect(
      page.getByText(`Adresse: /produkte/moebelteile/e2e-doppelt-${run}`, {
        exact: true,
      })
    ).toBeVisible();
    await create();
    const address = `Adresse: /produkte/moebelteile/e2e-doppelt-${run}-2`;
    await expect(page.getByText(address, { exact: true })).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill(`E2E Umbenannt ${run}`);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText("Gespeichert.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      `E2E Umbenannt ${run}`
    );
    await expect(page.getByText(address, { exact: true })).toBeVisible();
  });

  test("a saved SEO title becomes the public page title (6c SC-3)", async ({
    page,
  }) => {
    const slug = `e2e-seo-${run}`;
    const id = await createPublishedProduct(
      slug,
      `E2E SEO Produkt ${run}`,
      `E2E-SEO-${run}`
    );
    await page.goto(`/admin/produkte/${id}`);
    const details = page.locator("details", {
      hasText: "Suchmaschinen (optional)",
    });
    await expect(details).not.toHaveAttribute("open", "");
    await details.getByText("Suchmaschinen (optional)").click();
    await page.getByLabel("Titel für Suchmaschinen").fill(`E2E SEO ${run}`);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText("Gespeichert.", { exact: true })).toBeVisible();

    await page.goto(`/produkte/moebelteile/${slug}`);
    await expect(page).toHaveTitle(new RegExp(`E2E SEO ${run}`));
  });
});

test.describe("colour order (6c SC-4)", () => {
  test.describe.configure({ mode: "serial" });

  const swatches = (page: Page) =>
    page.getByRole("group", { name: "Farbe" }).locator("label");
  const announcement = (page: Page) =>
    page.getByText(/steht jetzt auf Position/);
  const saveColors = async (page: Page) => {
    await page.getByRole("button", { name: "Farben speichern" }).click();
    await expect(
      page.getByText("Farben gespeichert.", { exact: true })
    ).toBeVisible();
  };

  test("the up button and a mouse drag reorder and save the colours", async ({
    page,
  }) => {
    const slug = `e2e-farben-${run}`;
    const id = await createProductWithTwoColors(
      slug,
      `E2E Farben ${run}`,
      `E2E-F-${run}`
    );
    const publicUrl = `/produkte/moebelteile/${slug}`;
    await page.goto(publicUrl);
    await expect(swatches(page)).toHaveCount(2);
    await expect(swatches(page).first()).toContainText("weiß");

    await page.goto(`/admin/produkte/${id}`);
    await page.getByRole("button", { name: "Farbe 2 nach oben" }).click();
    await expect(announcement(page)).toHaveText(
      "grau steht jetzt auf Position 1 von 2."
    );
    await saveColors(page);
    await page.goto(publicUrl);
    await expect(swatches(page).first()).toContainText("grau");
    await expect(swatches(page).nth(1)).toContainText("weiß");

    await page.goto(`/admin/produkte/${id}`);
    const handles = page.getByTestId("drag-handle");
    await dragHandleWithMouse(page, handles.first(), handles.nth(1), "below");
    await expect(announcement(page)).toHaveText(
      "grau steht jetzt auf Position 2 von 2."
    );
    await saveColors(page);
    await page.goto(publicUrl);
    await expect(swatches(page).first()).toContainText("weiß");
    await expect(swatches(page).nth(1)).toContainText("grau");
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("press and hold on the handle, then moving, reorders the colours", async ({
      page,
    }) => {
      const slug = `e2e-touch-${run}`;
      const id = await createProductWithTwoColors(
        slug,
        `E2E Touch ${run}`,
        `E2E-T-${run}`
      );
      await page.goto(`/admin/produkte/${id}`);
      const handles = page.getByTestId("drag-handle");
      await dragHandleWithTouch(page, handles.first(), handles.nth(1), "below");
      await expect(announcement(page)).toHaveText(
        "weiß steht jetzt auf Position 2 von 2."
      );
      await saveColors(page);
      await page.goto(`/produkte/moebelteile/${slug}`);
      await expect(swatches(page).first()).toContainText("grau");
      await expect(swatches(page).nth(1)).toContainText("weiß");
    });
  });
});

test.describe("help popover (6c SC-5)", () => {
  const helpButton = (page: Page) =>
    page.getByRole("button", { name: "Was bedeutet Standard?" }).first();

  test("opens with Enter, closes with Escape and returns focus", async ({
    page,
  }) => {
    await page.goto("/admin/produkte/1");
    const button = helpButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(HELP_TEXT)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(HELP_TEXT)).toBeHidden();
    await expect(button).toBeFocused();
  });

  test.describe("on a phone", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("a tap opens the text inside the viewport, a tap outside closes it", async ({
      page,
    }) => {
      await page.goto("/admin/produkte/1");
      await helpButton(page).tap();
      const text = page.getByText(HELP_TEXT);
      await expect(text).toBeVisible();
      const box = await text.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);

      await page.getByRole("heading", { level: 1 }).tap();
      await expect(text).toBeHidden();
    });
  });
});

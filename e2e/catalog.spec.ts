import { expect, test, type Page } from "@playwright/test";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";
const PIPE = "/produkte/sanitaer/testrohrschelle";
const ORDER_NUMBERS = ["99010 - 1", "99010 - 2", "99011 - 1", "99011 - 2"];

// Text of the page markup without inline scripts (JSON-LD, RSC payload), so
// a number only counts if it is rendered into the page itself.
const pageText = (page: Page) =>
  page.locator("body").evaluate((body) => {
    const clone = body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script, style, template")
      .forEach((el) => el.remove());
    return clone.textContent ?? "";
  });

test.describe("public catalog", () => {
  test("home lists the categories (SC-2)", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Möbelteile \(Beispiel\)/ })
    ).toHaveAttribute("href", "/produkte/moebelteile");
    await expect(
      page.getByRole("link", { name: /Sanitärteile \(Beispiel\)/ })
    ).toHaveAttribute("href", "/produkte/sanitaer");
  });

  test("home hero is text only and shows the counts", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('section[aria-labelledby="start-titel"]');
    await expect(hero.locator("img")).toHaveCount(0);
    await expect(hero.getByText("3 Produktgruppen · 4 Artikel")).toBeVisible();
  });

  test("home number hint leads to the article anchor", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('section[aria-labelledby="start-titel"]');
    await hero.getByRole("link", { name: "99010", exact: true }).click();
    await expect(page).toHaveURL(
      /\/produkte\/moebelteile\/testkeil-mit-daempfung#artikel-99010$/
    );
    await expect(page.locator("#artikel-99010")).toHaveCSS(
      "background-color",
      "rgb(255, 246, 239)"
    );
  });

  test("category page shows intro and published products only (SC-3)", async ({
    page,
  }) => {
    await page.goto("/produkte/moebelteile");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Möbelteile (Beispiel)"
    );
    await expect(
      page.getByText("Beispieltext für die Kategorie Möbelteile.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Testkeil mit Dämpfung/ })
    ).toHaveAttribute("href", PRODUCT);
    await expect(
      page.getByRole("link", { name: /Testabdeckung/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Entwurfsteil")).toHaveCount(0);
  });

  test("unknown category and product return 404 (SC-3, SC-4)", async ({
    request,
  }) => {
    expect((await request.get("/produkte/gibt-es-nicht")).status()).toBe(404);
    expect(
      (await request.get("/produkte/moebelteile/gibt-es-nicht")).status()
    ).toBe(404);
    expect(
      (await request.get("/produkte/moebelteile/entwurfsteil")).status()
    ).toBe(404);
  });

  test("product page shows every article, the default-colour numbers and all four in the text (SC-4, SC-5)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Testkeil mit Dämpfung"
    );
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 1");
    await expect(page.locator("#artikel-99011")).toBeVisible();
    for (const n of ["99010 - 1", "99011 - 1"]) {
      await expect(page.getByText(n, { exact: false }).first()).toBeVisible();
    }
    const text = await pageText(page);
    for (const n of ORDER_NUMBERS) expect(text).toContain(n);
  });

  test("colour picker switches the order numbers (SC-5)", async ({ page }) => {
    await page.goto(PRODUCT);
    await page.getByText("weiß", { exact: true }).first().click();
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 2");
  });

  test("selection block follows article and colour and starts the inquiry (4b SC-4)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await page.getByRole("combobox", { name: "Artikel" }).selectOption({
      label: "99011 · 10 mm",
    });
    await page.getByText("weiß", { exact: true }).first().click();
    const box = page.getByRole("region", { name: "Bestellung" });
    await expect(box).toContainText("99011 - 2");
    await box.getByRole("link", { name: /Anfrage stellen/ }).click();
    await expect(page).toHaveURL(/\/anfrage\?bestellnummer=99011%20-%202$/);
    await expect(page.getByLabel("Bestellnummer", { exact: true })).toHaveValue(
      "99011 - 2"
    );
  });

  test("article anchor preselects the article (4b SC-4)", async ({ page }) => {
    await page.goto(`${PRODUCT}#artikel-99011`);
    await expect(page.getByRole("combobox", { name: "Artikel" })).toHaveValue(
      "99011"
    );
  });

  test("product without colours shows no picker (SC-5)", async ({ page }) => {
    await page.goto("/produkte/moebelteile/testabdeckung");
    await expect(page.getByRole("group", { name: "Farbe" })).toHaveCount(0);
    await expect(page.locator("#artikel-99300")).toContainText("99300");
    await expect(page.getByText("Kein Bild").first()).toBeVisible();
  });

  test("accessory links to its home product (SC-6)", async ({ page }) => {
    await page.goto("/produkte/moebelteile/testabdeckung");
    await expect(page.getByRole("link", { name: /99011/ })).toHaveAttribute(
      "href",
      `${PRODUCT}#artikel-99011`
    );
  });

  test("gallery images keep their size and never grow; the list image is not repeated (4b SC-1)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    const img = page.getByRole("img", {
      name: "Testkeil mit Dämpfung, Draufsicht",
    });
    await expect(img).toHaveAttribute("width", "465");
    await expect(img).toHaveAttribute("height", "200");
    const box = await img.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(465);
    await expect(
      page.getByRole("img", { name: "Testkeil mit Dämpfung, Seitenansicht" })
    ).toHaveCount(0);

    await page.goto(PIPE);
    const pipe = page.getByRole("img", { name: "Testrohrschelle" });
    const pipeBox = await pipe.boundingBox();
    expect(pipeBox?.width).toBeLessThanOrEqual(80);
  });

  test("gallery slider steps to the second image (4b SC-3)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    const next = page.getByRole("button", { name: "Nächstes Bild" });
    await expect(page.getByText("1 / 2")).toBeVisible();
    await next.click();
    await expect(page.getByText("2 / 2")).toBeVisible();
    await expect(next).toBeDisabled();
    const region = page.getByRole("region", { name: "Produktbilder" });
    const slide = region.getByRole("listitem").nth(1);
    await expect(async () => {
      const r = await region.boundingBox();
      const s = await slide.boundingBox();
      expect(s && r && s.x >= r.x - 1 && s.x < r.x + r.width).toBe(true);
    }).toPass();
  });

  test("tiles show the first gallery image or the list image, fitted to its size (4b SC-2)", async ({
    page,
  }) => {
    await page.goto("/produkte/moebelteile");
    const tile = page.getByRole("link", { name: /Testkeil mit Dämpfung/ });
    await expect(
      tile.getByRole("img", { name: "Testkeil mit Dämpfung, Draufsicht" })
    ).toHaveCount(1);

    await page.goto("/produkte/sanitaer");
    const pipeTile = page.getByRole("link", { name: /Testrohrschelle/ });
    const box = await pipeTile.getByRole("img").first().boundingBox();
    expect(box?.width).toBeLessThanOrEqual(80);
  });

  test("category register keeps the list image of a product (4b SC-2)", async ({
    page,
  }) => {
    await page.goto("/produkte");
    const row = page
      .getByRole("listitem")
      .filter({ hasText: "Möbelteile (Beispiel)" });
    await expect(row.locator('img[src*="testkeil-1.webp"]')).toHaveCount(1);
    await expect(row.locator('img[src*="testkeil-2.webp"]')).toHaveCount(0);
    await expect(row.locator('img[src*="testkeil-3.webp"]')).toHaveCount(0);
  });

  test("every JSON-LD sku is visible on the page (SC-7)", async ({ page }) => {
    await page.goto(PRODUCT);
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const data = JSON.parse(json ?? "{}") as { hasVariant?: { sku: string }[] };
    const body = await pageText(page);
    expect(data.hasVariant?.length).toBe(4);
    for (const v of data.hasVariant ?? []) expect(body).toContain(v.sku);
  });

  test("AI-generated description is labelled (SC-13)", async ({ page }) => {
    await page.goto("/produkte/sanitaer/testrohrschelle");
    await expect(page.getByText("KI-generiert")).toBeVisible();
  });

  test("product page is cached after the first request (SC-11)", async ({
    request,
  }) => {
    await request.get(PRODUCT);
    const second = await request.get(PRODUCT);
    expect(second.headers()["x-nextjs-cache"]).toBe("HIT");
  });

  for (const width of [360, 1280]) {
    test(`shell without horizontal scroll at ${width}px (SC-1)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PRODUCT);
      await expect(
        page.getByRole("region", { name: "Hinweis zur Vorschau" })
      ).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("all order numbers are in the HTML, the list opens by click (4b SC-5)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await expect(
      page.getByRole("heading", { name: "Alle Bestellnummern" })
    ).toHaveCount(0);
    const details = page.locator("details");
    const text = (await details.textContent()) ?? "";
    for (const n of ORDER_NUMBERS) expect(text).toContain(n);
    await details.locator("summary").click();
    for (const n of ORDER_NUMBERS)
      await expect(
        details.getByText(n, { exact: false }).first()
      ).toBeVisible();
  });

  test("gallery slides are in the DOM and scroll sideways (4b SC-3)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    const region = page.getByRole("region", { name: "Produktbilder" });
    await expect(region.getByRole("listitem")).toHaveCount(2);
    const { scrollWidth, clientWidth } = await region.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});

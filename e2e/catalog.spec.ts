import { expect, test } from "@playwright/test";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";

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

  test("product page shows every article and order number (SC-4, SC-5)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Testkeil mit Dämpfung"
    );
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 1");
    await expect(page.locator("#artikel-99011")).toBeVisible();
    for (const n of ["99010 - 1", "99010 - 2", "99011 - 1", "99011 - 2"]) {
      await expect(page.getByText(n, { exact: false }).first()).toBeVisible();
    }
  });

  test("colour picker switches the order numbers (SC-5)", async ({ page }) => {
    await page.goto(PRODUCT);
    await page.getByText("weiß", { exact: true }).first().click();
    await expect(page.locator("#artikel-99010")).toContainText("99010 - 2");
  });

  test("order box follows the colour and links to the inquiry (SC-4)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await page.getByText("weiß", { exact: true }).first().click();
    const box = page.getByRole("region", { name: "Bestellung" });
    await expect(box).toContainText("99010 - 2");
    await expect(
      box.getByRole("link", { name: /Anfrage stellen/ })
    ).toHaveAttribute("href", /bestellnummer=99010%20-%202/);
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

  test("seeded image renders with intrinsic size (SC-10)", async ({ page }) => {
    await page.goto(PRODUCT);
    const img = page.getByRole("img", {
      name: "Testkeil mit Dämpfung, Seitenansicht",
    });
    await expect(img).toHaveAttribute("width", "800");
    await expect(img).toHaveAttribute("height", "600");
  });

  test("every JSON-LD sku is visible on the page (SC-7)", async ({ page }) => {
    await page.goto(PRODUCT);
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const data = JSON.parse(json ?? "{}") as { hasVariant?: { sku: string }[] };
    const body = await page.locator("body").innerText();
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

  test("all order numbers are in the HTML (SC-5)", async ({ page }) => {
    await page.goto(PRODUCT);
    const body = await page.locator("body").innerText();
    for (const n of ["99010 - 1", "99010 - 2", "99011 - 1", "99011 - 2"])
      expect(body).toContain(n);
  });
});

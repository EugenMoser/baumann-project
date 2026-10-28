import { expect, test } from "@playwright/test";

test.describe("search (SC-8)", () => {
  test("exact order number redirects to the article", async ({ page }) => {
    await page.goto("/suche?q=99010-1");
    await expect(page).toHaveURL(
      /\/produkte\/moebelteile\/testkeil-mit-daempfung#artikel-99010$/
    );
    await expect(page.locator("#artikel-99010")).toHaveCSS(
      "background-color",
      "rgb(255, 246, 239)"
    );
  });

  test("order number with a slash redirects to its anchor", async ({
    page,
  }) => {
    await page.goto(`/suche?q=${encodeURIComponent("99211/80 - 0")}`);
    await expect(page).toHaveURL(
      /\/produkte\/sanitaer\/testrohrschelle#artikel-99211-80$/
    );
  });

  test("a hit row shows the matched number in mono type (SC-5)", async ({
    page,
  }) => {
    await page.goto("/suche?q=99211");
    const row = page.getByRole("listitem").filter({ hasText: "99211/80" });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("99211/80").first()).toHaveCSS(
      "font-family",
      /Plex Mono/
    );
  });

  test("a hit row shows the list image (4b SC-2)", async ({ page }) => {
    await page.goto("/suche?q=Testkeil");
    await expect(
      page.getByRole("img", { name: "Testkeil mit Dämpfung, Seitenansicht" })
    ).toHaveCount(1);
  });

  test("a word shows a result list", async ({ page }) => {
    await page.goto("/suche?q=Befestigung");
    await expect(
      page.getByRole("link", { name: "Testrohrschelle" })
    ).toBeVisible();
  });

  test("no hits shows a message", async ({ page }) => {
    await page.goto("/suche?q=Gibtesnicht");
    await expect(
      page.getByText("Keine Treffer für „Gibtesnicht“.")
    ).toBeVisible();
  });

  test("too short query shows a hint without searching", async ({ page }) => {
    await page.goto("/suche?q=a");
    await expect(
      page.getByText("Bitte mindestens 2 Zeichen eingeben.")
    ).toBeVisible();
  });

  test("header search submits to /suche", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").first().fill("Befestigung");
    await page.getByRole("button", { name: "Suchen" }).first().click();
    await expect(page).toHaveURL(/\/suche\?q=Befestigung/);
  });
});

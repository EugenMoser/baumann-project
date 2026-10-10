import { expect, test, type Page } from "@playwright/test";
import { branding } from "../config/branding";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";

async function fillValid(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("Erika Muster");
  await page.getByLabel("E-Mail").fill("erika@example.com");
  await page.getByLabel("Menge (optional)").fill("500");
  await page.getByLabel("Nachricht").fill("Bitte um Muster.");
  await page.getByRole("checkbox").check();
}

test.describe("inquiry", () => {
  test("prefill shows number, product link and demo notice (SC-8)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=99010-1");
    await expect(page.getByLabel("Bestellnummer", { exact: true })).toHaveValue(
      "99010 - 1"
    );
    await expect(
      page.getByRole("link", { name: "Testkeil mit Dämpfung" }).first()
    ).toHaveAttribute("href", PRODUCT);
    const notice = page.getByRole("complementary", {
      name: "Hinweis zum Formular",
    });
    await expect(notice).toContainText("nicht versendet");
    await expect(
      notice.getByRole("link", { name: "offizielle Website" })
    ).toBeVisible();
    await expect(
      notice.getByRole("link", { name: "offizielle Website" })
    ).toHaveAttribute("href", branding.officialSiteUrl);
  });

  test("unknown number shows a hint, odd parameters do not break the page (SC-8, Review Focus 4)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=00000");
    await expect(page.getByText(/nicht im Katalog/).first()).toBeVisible();
    for (const query of [
      `?bestellnummer=${"x".repeat(500)}`,
      "?bestellnummer=a&bestellnummer=b",
      "?bestellnummer=",
    ]) {
      const response = await page.goto(`/anfrage${query}`);
      expect(response?.status(), query).toBe(200);
    }
  });

  test("valid submit with JavaScript shows the result panel (SC-11)", async ({
    page,
  }) => {
    await page.goto("/anfrage?bestellnummer=99010%20-%201");
    await fillValid(page);
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("nicht versendet");
    await expect(status).toContainText("99010 - 1");
  });

  test("invalid e-mail shows the field error (SC-11)", async ({ page }) => {
    await page.goto("/anfrage");
    await fillValid(page);
    await page.getByLabel("E-Mail").fill("kaputt");
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByText(/gültige E-Mail-Adresse/)).toBeVisible();
  });

  test("server-side error keeps every value (Review Focus 2)", async ({
    page,
  }) => {
    await page.goto("/anfrage");
    await page.getByLabel("Bestellnummer", { exact: true }).fill("00000");
    await fillValid(page);
    await page.getByLabel("Firma (optional)").fill("Muster GmbH");
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    // The server-side field error, not the prefill hint.
    await expect(page.locator("#anfrage-orderNumber-fehler")).toContainText(
      "nicht im Katalog"
    );
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Erika Muster"
    );
    await expect(page.getByLabel("Firma (optional)")).toHaveValue(
      "Muster GmbH"
    );
    await expect(page.getByLabel("Bestellnummer", { exact: true })).toHaveValue(
      "00000"
    );
    await expect(page.getByLabel("E-Mail")).toHaveValue("erika@example.com");
    await expect(page.getByLabel("Menge (optional)")).toHaveValue("500");
    await expect(page.getByLabel("Nachricht")).toHaveValue("Bitte um Muster.");
    await expect(page.getByRole("checkbox")).toBeChecked();
  });

  test("product page call to action opens the prefilled form (SC-13)", async ({
    page,
  }) => {
    await page.goto(PRODUCT);
    await page.getByRole("link", { name: "Anfrage stellen" }).click();
    await expect(page).toHaveURL(/\/anfrage\?bestellnummer=99010%20-%201$/);
    await expect(page.getByLabel("Bestellnummer", { exact: true })).toHaveValue(
      "99010 - 1"
    );
  });
});

test.describe("inquiry without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("valid submit shows the result panel (SC-11)", async ({ page }) => {
    await page.goto("/anfrage?bestellnummer=99010%20-%201");
    await fillValid(page);
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByRole("status")).toContainText("nicht versendet");
  });
});

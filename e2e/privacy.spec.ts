import { expect, test, type Page } from "@playwright/test";
import { INQUIRY_PRIVACY_HREF, PRIVACY_PATH } from "../lib/legal";

const PRODUCT = "/produkte/moebelteile/testkeil-mit-daempfung";

async function fillValid(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("Erika Muster");
  await page.getByLabel("E-Mail").fill("erika@example.com");
  await page.getByLabel("Menge (optional)").fill("500");
  await page.getByLabel("Nachricht").fill("Bitte um Muster.");
  await page.getByRole("checkbox").check();
}

async function submitInquiry(page: Page) {
  await page.goto("/anfrage?bestellnummer=99010%20-%201");
  await fillValid(page);
  await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
  await expect(page.getByRole("status")).toContainText("nicht versendet");
}

test.describe("privacy policy facts", () => {
  test("public pages and the inquiry submit set no cookie (5b SC-3)", async ({
    page,
    context,
  }) => {
    for (const path of ["/", PRODUCT, PRIVACY_PATH]) {
      await page.goto(path);
    }
    await submitInquiry(page);
    expect(await context.cookies()).toEqual([]);
  });

  test("login page alone sets no cookie (Review Focus 1)", async ({
    page,
    context,
  }) => {
    await page.goto("/admin/login");
    await page.goto("/");
    expect(await context.cookies()).toEqual([]);
  });

  test("home and product page request only the app origin (5b SC-4)", async ({
    page,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error("baseURL is not configured");
    }
    const appOrigin = new URL(baseURL).origin;
    const urls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("data:") && !url.startsWith("blob:")) {
        urls.push(url);
      }
    });
    for (const path of ["/", PRODUCT]) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
    expect(urls.length).toBeGreaterThan(0);
    const foreign = urls.filter((url) => new URL(url).origin !== appOrigin);
    expect(foreign, "requests to another origin").toEqual([]);
  });

  test("form privacy link opens the inquiry section (Review Focus 2)", async ({
    page,
  }) => {
    await page.goto("/anfrage");
    await page.getByRole("link", { name: "Datenschutzhinweise" }).click();
    await expect(page).toHaveURL(
      (url) => `${url.pathname}${url.hash}` === INQUIRY_PRIVACY_HREF
    );
    await expect(
      page.getByRole("heading", { name: "Anfrageformular" })
    ).toBeInViewport();
  });
});

test.describe("privacy policy facts without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("no-JS inquiry submit sets no cookie (5b SC-3)", async ({
    page,
    context,
  }) => {
    await submitInquiry(page);
    expect(await context.cookies()).toEqual([]);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { makePng } from "../../tests/fixtures/images";
import { createPublishedProduct, STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const SLUG = `e2e-bilder-${run}`;
const NAME = `E2E Bilder ${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let editUrl = "";

const publicHtml = async (page: Page) =>
  (await page.request.get(PUBLIC_URL)).text();

test.beforeAll(async () => {
  const id = await createPublishedProduct(SLUG, NAME, `E2E-B-${run}`);
  editUrl = `/admin/produkte/${id}`;
});

test("upload an image (SC-2)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "e2e.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(40, 30)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Erstes Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(
    page.getByText("Bild hochgeladen.", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Vorschaubild" })).toBeChecked();
  expect(await publicHtml(page)).toContain(`alt="Erstes Bild ${run}"`);
});

test("reject a file that is not an image (SC-1)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "fake.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await page.getByLabel("Alt-Text", { exact: true }).last().fill("x");
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(page.getByText("Nur JPEG, PNG oder WebP.")).toBeVisible();
});

test("edit alt text and order (SC-5)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "zwei.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(30, 30)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Zweites Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(
    page.getByText("Bild hochgeladen.", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Bild 2 nach oben" }).click();
  await page.getByRole("radio", { name: "Vorschaubild" }).first().check();
  await page
    .getByLabel("Alt-Text", { exact: true })
    .first()
    .fill(`Zweites Bild neu ${run}`);
  await page.getByRole("button", { name: "Bilder speichern" }).click();
  await expect(
    page.getByText("Bilder gespeichert.", { exact: true })
  ).toBeVisible();

  const html = await publicHtml(page);
  expect(html).toContain(`alt="Zweites Bild neu ${run}"`);
  expect(html.indexOf(`Zweites Bild neu ${run}`)).toBeLessThan(
    html.indexOf(`Erstes Bild ${run}`)
  );
});

test("remove images until none is left, then upload again (SC-6, Review Focus 4)", async ({
  page,
}) => {
  await page.goto(editUrl);
  for (const n of [1, 2]) {
    await page.getByRole("button", { name: "Bild 1 entfernen" }).click();
    await page.getByRole("button", { name: "Endgültig entfernen" }).click();
    await expect(
      page.getByText("Bild entfernt.", { exact: true }).first()
    ).toBeVisible();
    if (n === 1)
      await expect(
        page.getByRole("button", { name: "Bild 1 entfernen" })
      ).toBeVisible();
  }
  await expect(page.getByText("Noch keine Bilder.")).toBeVisible();
  const empty = await publicHtml(page);
  expect(empty).not.toContain(`Erstes Bild ${run}`);
  expect(empty).toContain("Kein Bild");

  await page.getByLabel("Bilddatei").setInputFiles({
    name: "drei.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(20, 20)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Drittes Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(page.getByRole("radio", { name: "Vorschaubild" })).toBeChecked();
  expect(await publicHtml(page)).toContain(`alt="Drittes Bild ${run}"`);
});

test("add an accessory (SC-9)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Zubehör hinzufügen" }).click();
  await page.getByLabel("Artikelnummer").last().fill(" 99211/80 ");
  await page.getByRole("button", { name: "Zubehör speichern" }).click();
  await expect(
    page.getByText("Zubehör gespeichert.", { exact: true })
  ).toBeVisible();
  const html = await publicHtml(page);
  expect(html).toContain("Passendes Zubehör");
  expect(html).toContain("99211/80");

  await page.getByRole("button", { name: "Zubehör hinzufügen" }).click();
  await page.getByLabel("Artikelnummer").last().fill("GIBT-ES-NICHT");
  await page.getByRole("button", { name: "Zubehör speichern" }).click();
  await expect(
    page.getByText("Diese Artikelnummer gibt es nicht.")
  ).toBeVisible();
});

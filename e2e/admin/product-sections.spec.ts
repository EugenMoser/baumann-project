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
  await expect(page.getByRole("radio", { name: "Listenbild" })).toBeChecked();
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

async function uploadImage(page: Page, name: string, alt: string) {
  await page.getByLabel("Bilddatei").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(makePng(30, 30)),
  });
  await page.getByLabel("Alt-Text", { exact: true }).last().fill(alt);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(
    page.getByText("Bild hochgeladen.", { exact: true })
  ).toBeVisible();
}

test("edit alt text and order (SC-5, 4b SC-6)", async ({ page }) => {
  await page.goto(editUrl);
  await uploadImage(page, "zwei.png", `Zweites Bild ${run}`);
  await uploadImage(page, "drei.png", `Drittes Bild ${run}`);

  // Rows: Erstes (list image), Zweites, Drittes.
  const alts = page.getByLabel("Alt-Text", { exact: true });
  await page.getByRole("button", { name: "Bild 3 nach oben" }).click();
  // Rows: Erstes, Drittes, Zweites.
  await page.getByRole("radio", { name: "Listenbild" }).nth(2).check();
  await alts.first().fill(`Erstes Bild neu ${run}`);
  await page.getByRole("button", { name: "Bilder speichern" }).click();
  await expect(
    page.getByText("Bilder gespeichert.", { exact: true })
  ).toBeVisible();

  // The list image is no gallery slide: the gallery shows Erstes, then Drittes.
  const html = await publicHtml(page);
  const first = html.indexOf(`alt="Erstes Bild neu ${run}"`);
  const third = html.indexOf(`alt="Drittes Bild ${run}"`);
  expect(first).toBeGreaterThan(-1);
  expect(third).toBeGreaterThan(first);
  expect(html).not.toContain(`Zweites Bild ${run}`);
  // Search results show the list image.
  const search = await page.request.get(`/suche?q=${encodeURIComponent(NAME)}`);
  expect(await search.text()).toContain(`alt="Zweites Bild ${run}"`);
});

test("remove images until none is left, then upload again (SC-6, Review Focus 4)", async ({
  page,
}) => {
  await page.goto(editUrl);
  for (const n of [1, 2, 3]) {
    await page.getByRole("button", { name: "Bild 1 entfernen" }).click();
    await page.getByRole("button", { name: "Endgültig entfernen" }).click();
    await expect(
      page.getByText("Bild entfernt.", { exact: true }).first()
    ).toBeVisible();
    if (n < 3)
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
  await expect(page.getByRole("radio", { name: "Listenbild" })).toBeChecked();
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

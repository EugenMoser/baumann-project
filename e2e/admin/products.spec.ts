import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const NAME = `E2E Produkt ${run}`;
const SLUG = `e2e-produkt-${run}`;
const NUMBER = `E2E-${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let editUrl = "";

const statusSelect = (page: Page) => page.getByLabel("Status");
const nameInput = (page: Page) => page.getByLabel("Name", { exact: true });
const saveProduct = (page: Page) =>
  page.getByRole("button", { name: "Speichern", exact: true }).click();
// exact: "Farben gespeichert." would match a substring search as well.
const savedToast = (page: Page) =>
  page.getByText("Gespeichert.", { exact: true });

test("filter by article number shows its product (SC-5)", async ({ page }) => {
  await page.goto("/admin/produkte");
  await page.getByLabel("Name oder Artikelnummer").fill("99211/80");
  await page.getByRole("button", { name: "Filtern" }).click();
  await expect(page).toHaveURL(/q=99211%2F80/);
  await expect(
    page.getByRole("link", { name: "Testrohrschelle" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Testkeil mit Dämpfung" })
  ).toHaveCount(0);
});

test("create a draft (SC-6)", async ({ page }) => {
  await page.goto("/admin/produkte/neu");
  await page
    .getByLabel("Kategorie")
    .selectOption({ label: "Möbelteile (Beispiel)" });
  await nameInput(page).fill(NAME);
  await expect(page.getByLabel("Slug")).toHaveValue(SLUG);
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte\/\d+$/);
  editUrl = new URL(page.url()).pathname;
  const response = await page.request.get(PUBLIC_URL);
  expect(response.status()).toBe(404);
});

test("a validation error keeps changed selects (SC-6)", async ({ page }) => {
  await page.goto(editUrl);
  await statusSelect(page).selectOption("archived");
  await nameInput(page).fill("");
  await saveProduct(page);
  await expect(page.getByText("Bitte einen Namen eingeben.")).toBeVisible();
  await expect(nameInput(page)).toHaveAttribute("aria-invalid", "true");
  await expect(statusSelect(page)).toHaveValue("archived");

  await nameInput(page).fill(NAME);
  await statusSelect(page).selectOption("draft");
  await saveProduct(page);
  await expect(savedToast(page)).toBeVisible();
  await expect(statusSelect(page)).toHaveValue("draft");
  await expect(nameInput(page)).toHaveValue(NAME);
});

test("publishing without articles is refused (SC-11)", async ({ page }) => {
  await page.goto(editUrl);
  await statusSelect(page).selectOption("published");
  await saveProduct(page);
  // Filtered by text: Next's route announcer is an alert as well.
  await expect(
    page.getByRole("alert").filter({ hasText: "mindestens einen Artikel" })
  ).toBeVisible();
  await page.reload();
  await expect(statusSelect(page)).toHaveValue("draft");
});

test("add an article with attribute and pack size (SC-9)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Artikel hinzufügen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Artikelnummer").fill(NUMBER);
  await dialog.getByLabel("Höhe (mm)").fill("8,5");
  await dialog.getByLabel("Menge").first().fill("250");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Artikel gespeichert.", { exact: true })
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Artikel" });
  await expect(table).toContainText(NUMBER);
  await expect(table).toContainText("Höhe 8,5 mm");
  await expect(table).toContainText("250");
});

test("assign a default colour and publish (SC-10, SC-11)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Farbe hinzufügen" }).click();
  await page.getByLabel("Suffix").first().fill("1");
  await page.getByLabel("Standard").first().check();
  await page.getByRole("button", { name: "Farben speichern" }).click();
  await expect(
    page.getByText("Farben gespeichert.", { exact: true })
  ).toBeVisible();

  await statusSelect(page).selectOption("published");
  await saveProduct(page);
  await expect(savedToast(page)).toBeVisible();
  // React 19 resets uncontrolled form fields after an action; the select
  // must still show the saved value, before and after a reload.
  await expect(statusSelect(page)).toHaveValue("published");
  await page.reload();
  await expect(statusSelect(page)).toHaveValue("published");

  await page.goto(PUBLIC_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME })
  ).toBeVisible();
  await expect(page.getByText(`${NUMBER} - 1`).first()).toBeVisible();
});

test("published products cannot be deleted, their last article neither (SC-9, SC-12)", async ({
  page,
}) => {
  await page.goto(editUrl);
  await expect(
    page.getByRole("button", { name: "Produkt löschen" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: `Artikel ${NUMBER} löschen` }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(confirm.getByRole("alert")).toContainText(
    "mindestens einen Artikel"
  );
  await confirm.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("table", { name: "Artikel" })).toContainText(
    NUMBER
  );
});

test("renaming shows the new name on the next request (SC-13)", async ({
  page,
}) => {
  // The category card renders the name twice (one per breakpoint).
  const cardName = (name: string) =>
    page.getByText(name, { exact: true }).filter({ visible: true }).first();
  await page.goto(PUBLIC_URL); // warm the ISR cache
  await page.goto("/produkte/moebelteile");
  await expect(cardName(NAME)).toBeVisible();
  await page.goto(editUrl);
  await nameInput(page).fill(`${NAME} neu`);
  await saveProduct(page);
  await expect(savedToast(page)).toBeVisible();
  await page.goto(PUBLIC_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: `${NAME} neu` })
  ).toBeVisible();
  await page.goto("/produkte/moebelteile");
  await expect(cardName(`${NAME} neu`)).toBeVisible();
  await expect(page.getByText(NAME, { exact: true })).toHaveCount(0);
});

test("archive, then delete after confirmation (SC-12)", async ({ page }) => {
  await page.goto(editUrl);
  await statusSelect(page).selectOption("archived");
  await saveProduct(page);
  await expect(savedToast(page)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Produkt löschen" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Endgültig löschen" })
    .click();
  await expect(page).toHaveURL(/\/admin\/produkte$/);
  await expect(page.getByRole("link", { name: `${NAME} neu` })).toHaveCount(0);
});

test("a deleted product shows the admin 404 page", async ({ page }) => {
  const response = await page.goto(editUrl);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nicht gefunden" })
  ).toBeVisible();
  await expect(
    page.getByText("Diesen Datensatz gibt es nicht (mehr).")
  ).toBeVisible();
  // Admin chrome only: no public footer.
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await page.getByRole("link", { name: "← Alle Produkte" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte$/);
});

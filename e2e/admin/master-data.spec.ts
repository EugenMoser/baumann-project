import { expect, test, type Page } from "@playwright/test";
import {
  createPublishedProduct,
  serviceClient,
  STORAGE_STATE,
} from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const CATEGORY = `E2E Kategorie ${run}`;
const COLOR = `E2E Farbe ${run}`;
const COLOR_FREE = `E2E Frei ${run}`;
const MATERIAL = `E2E-${run}`.slice(0, 20);
const MATERIAL_FREE = `E2E-F${run}`.slice(0, 20);
const SLUG = `e2e-stamm-${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let productId = 0;

test.beforeAll(async () => {
  productId = await createPublishedProduct(
    SLUG,
    `E2E Stamm ${run}`,
    `E2E-S-${run}`
  );
});

async function createColor(page: Page, name: string) {
  await page.goto("/admin/farben");
  await page.getByRole("button", { name: "Farbe anlegen" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Farbcode").fill("#aa0000");
  await page.getByLabel("Farbfamilie").fill("rot");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Farbe gespeichert.", { exact: true })
  ).toBeVisible();
}

async function createMaterial(page: Page, code: string) {
  await page.goto("/admin/materialien");
  await page.getByRole("button", { name: "Material anlegen" }).click();
  await page.getByLabel("Kürzel").fill(code);
  await page.getByLabel("Name").fill("E2E Material");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Material gespeichert.", { exact: true })
  ).toBeVisible();
}

test("create a category with an attribute (SC-10)", async ({ page }) => {
  await page.goto("/admin/kategorien/neu");
  await page.getByLabel("Name", { exact: true }).fill(CATEGORY);
  await expect(page.getByLabel("Slug")).toHaveValue(`e2e-kategorie-${run}`);
  await page.getByRole("checkbox", { name: "Oberfläche" }).check();
  await page.getByRole("button", { name: "Kategorie anlegen" }).click();
  await expect(page).toHaveURL(/\/admin\/kategorien\/\d+$/);
  const categoryId = Number(page.url().split("/").pop());

  await page.goto("/admin/produkte/neu");
  await expect(
    page.getByLabel("Kategorie").locator("option", { hasText: CATEGORY })
  ).toHaveCount(1);

  // The attribute shows up as a field in the article dialog of that category.
  const svc = serviceClient();
  const { data: product, error } = await svc
    .from("product")
    .insert({
      category_id: categoryId,
      slug: `e2e-attr-${run}`,
      name: `E2E Attribut ${run}`,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  await page.goto(`/admin/produkte/${product.id}`);
  await page.getByRole("button", { name: "Artikel hinzufügen" }).click();
  await expect(page.getByRole("dialog").getByLabel("Oberfläche")).toBeVisible();
  await page.keyboard.press("Escape");
  const { error: deleteError } = await svc
    .from("product")
    .delete()
    .eq("id", product.id);
  if (deleteError) throw deleteError;
});

test("delete an empty category redirects to the list (SC-10)", async ({
  page,
}) => {
  await page.goto("/admin/kategorien");
  await page.getByRole("link", { name: CATEGORY }).click();
  await expect(page).toHaveURL(/\/admin\/kategorien\/\d+$/);
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/admin\/kategorien$/);
  await expect(page.getByRole("link", { name: CATEGORY })).toHaveCount(0);
});

test("rename a used colour (SC-11)", async ({ page }) => {
  await createColor(page, COLOR);

  const svc = serviceClient();
  const { data } = await svc
    .from("color")
    .select("id")
    .eq("name", COLOR)
    .single();
  await svc.from("product_color").insert({
    product_id: productId,
    color_id: data!.id,
    suffix: "9",
    is_default: true,
  });

  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(COLOR) })
    .getByRole("button", { name: "Bearbeiten" })
    .click();
  await page.getByLabel("Name").fill(`${COLOR} neu`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Farbe gespeichert.", { exact: true })
  ).toBeVisible();
  expect(await (await page.request.get(PUBLIC_URL)).text()).toContain(
    `${COLOR} neu`
  );
});

test("deleting a used colour is refused, the dialog stays open (SC-11)", async ({
  page,
}) => {
  await page.goto("/admin/farben");
  await page
    .getByRole("row", { name: new RegExp(COLOR) })
    .getByRole("button", { name: "Löschen" })
    .click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("alert").filter({
      hasText: "Die Farbe ist noch Produkten zugeordnet.",
    })
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("deleting an unused colour closes the dialog and removes the row (SC-11)", async ({
  page,
}) => {
  await createColor(page, COLOR_FREE);
  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(COLOR_FREE) })
    .getByRole("button", { name: "Löschen" })
    .click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: new RegExp(COLOR_FREE) })
  ).toHaveCount(0);
});

test("deleting a used material is refused (SC-11)", async ({ page }) => {
  await createMaterial(page, MATERIAL);

  const svc = serviceClient();
  const { data } = await svc
    .from("material")
    .select("id")
    .eq("code", MATERIAL)
    .single();
  await svc
    .from("product")
    .update({ material_id: data!.id })
    .eq("id", productId);

  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(MATERIAL) })
    .getByRole("button", { name: "Löschen" })
    .click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: "Das Material wird noch verwendet." })
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("deleting an unused material closes the dialog and removes the row (SC-11)", async ({
  page,
}) => {
  await createMaterial(page, MATERIAL_FREE);
  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(MATERIAL_FREE) })
    .getByRole("button", { name: "Löschen" })
    .click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: new RegExp(MATERIAL_FREE) })
  ).toHaveCount(0);
});

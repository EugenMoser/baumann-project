import { expect, test, type Page } from "@playwright/test";
import {
  createPublishedProduct,
  serviceClient,
  STORAGE_STATE,
} from "./support";

// The fake model (AI_FAKE_MODEL=1, see playwright.config.ts) answers after
// 1500 ms with "Testvorschlag für {produkt}. …"; no provider is involved.
// Every test creates its own "e2e-" product, which the teardown removes.
test.use({ storageState: STORAGE_STATE });

const run = Date.now().toString(36);
const SEO_TITLE_SUFFIX = "Testvorschlag";

type Fixture = { id: number; name: string; publicUrl: string };

async function createProduct(key: string): Promise<Fixture> {
  const slug = `e2e-ki-${key}-${run}`;
  const name = `E2E KI ${key} ${run}`;
  const id = await createPublishedProduct(slug, name, `E2E-KI-${key}-${run}`);
  return { id, name, publicUrl: `/produkte/moebelteile/${slug}` };
}

const suggestButton = (page: Page) =>
  page.getByRole("button", { name: "Mit KI vorschlagen" });
const box = (page: Page, label: string) =>
  page.getByRole("group", { name: `KI-Vorschlag: ${label}`, exact: true });
// The public description block: paragraph -> text wrapper -> block that also
// holds the origin label (app/(site)/produkte/[category]/[product]/page.tsx).
const publicDescription = (page: Page, text: string) =>
  page.getByText(text).locator("xpath=../..");
const description = (page: Page) => page.getByLabel("Beschreibung (Markdown)");
const seoTitle = (page: Page) =>
  page.getByLabel("Titel für Suchmaschinen", { exact: true });
// exact: "Farben gespeichert." would match a substring search as well.
const savedToast = (page: Page) =>
  page.getByText("Gespeichert.", { exact: true });
const save = (page: Page) =>
  page.getByRole("button", { name: "Speichern", exact: true }).click();

async function requestSuggestions(page: Page, fixture: Fixture) {
  await page.goto(`/admin/produkte/${fixture.id}`);
  await suggestButton(page).click();
  await expect(box(page, "Beschreibung")).toBeVisible();
}

test("saving works while a suggestion is pending (SC-1)", async ({ page }) => {
  const fixture = await createProduct("pending");
  // Hold the answer back until the save is done, so the order does not
  // depend on the fake model's delay.
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/ki-vorschlag", async (route) => {
    const response = await route.fetch();
    await released;
    await route.fulfill({ response });
  });

  await page.goto(`/admin/produkte/${fixture.id}`);
  await suggestButton(page).click();
  await expect(
    page.getByRole("button", { name: "Vorschlag wird erstellt …" })
  ).toBeDisabled();

  await page.getByLabel("Untertitel").fill("Neuer Untertitel");
  await save(page);
  await expect(savedToast(page)).toBeVisible();
  // Saved while the model was still working: no box exists yet.
  await expect(box(page, "Beschreibung")).toHaveCount(0);

  release();
  await expect(box(page, "Beschreibung")).toBeVisible();
  await expect(box(page, "Titel für Suchmaschinen")).toBeVisible();
  await expect(box(page, "Beschreibung für Suchmaschinen")).toBeVisible();
  await expect(page.getByLabel("Untertitel")).toHaveValue("Neuer Untertitel");
});

test("accepted description and SEO title are labelled and published (SC-5)", async ({
  page,
}) => {
  const fixture = await createProduct("accept");
  await requestSuggestions(page, fixture);

  await box(page, "Beschreibung")
    .getByRole("button", { name: "Übernehmen" })
    .click();
  await expect(box(page, "Beschreibung")).toHaveCount(0);
  await expect(description(page)).toHaveValue(
    new RegExp(`^Testvorschlag für ${fixture.name}\\.`)
  );
  await box(page, "Titel für Suchmaschinen")
    .getByRole("button", { name: "Übernehmen" })
    .click();
  await expect(seoTitle(page)).toHaveValue(
    `${fixture.name} ${SEO_TITLE_SUFFIX}`
  );

  await save(page);
  await expect(savedToast(page)).toBeVisible();

  await page.goto(fixture.publicUrl);
  const text = `Testvorschlag für ${fixture.name}.`;
  await expect(page.getByText(text)).toBeVisible();
  await expect(
    publicDescription(page, text).getByText("KI-generiert", { exact: true })
  ).toBeVisible();
  await expect(page).toHaveTitle(
    new RegExp(`^${fixture.name} ${SEO_TITLE_SUFFIX}`)
  );
});

test("an edited accepted description is labelled as edited (SC-6)", async ({
  page,
}) => {
  const fixture = await createProduct("edited");
  await requestSuggestions(page, fixture);

  await box(page, "Beschreibung")
    .getByRole("button", { name: "Übernehmen" })
    .click();
  const text = `Testvorschlag für ${fixture.name}. Redaktionell ergänzt.`;
  await description(page).fill(text);
  await save(page);
  await expect(savedToast(page)).toBeVisible();

  await page.goto(fixture.publicUrl);
  await expect(page.getByText(text)).toBeVisible();
  const block = publicDescription(page, text);
  await expect(
    block.getByText("KI-unterstützt, redaktionell bearbeitet", { exact: true })
  ).toBeVisible();
  await expect(block.getByText("KI-generiert", { exact: true })).toHaveCount(0);
});

test("discarding a suggestion leaves the description unchanged (SC-5)", async ({
  page,
}) => {
  const fixture = await createProduct("discard");
  const original = "Ursprünglicher Beschreibungstext.";
  const { error } = await serviceClient()
    .from("product")
    .update({ description: original })
    .eq("id", fixture.id);
  if (error) throw error;

  await requestSuggestions(page, fixture);
  await box(page, "Beschreibung")
    .getByRole("button", { name: "Verwerfen" })
    .click();
  await expect(box(page, "Beschreibung")).toHaveCount(0);
  await expect(description(page)).toHaveValue(original);

  await save(page);
  await expect(savedToast(page)).toBeVisible();
  await page.goto(fixture.publicUrl);
  await expect(page.getByText(original)).toBeVisible();
  const block = publicDescription(page, original);
  await expect(block.getByText("KI-generiert", { exact: true })).toHaveCount(0);
  await expect(
    block.getByText("KI-unterstützt, redaktionell bearbeitet", { exact: true })
  ).toHaveCount(0);
});

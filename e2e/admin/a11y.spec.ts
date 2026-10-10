import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });

async function blocking(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
    );
}

test.describe("admin login accessibility (SC-4)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page", async ({ page }) => {
    await page.goto("/admin/login");
    expect(await blocking(page)).toEqual([]);
  });
});

test.describe("admin accessibility and noindex (SC-4)", () => {
  test("list, edit form and open dialog", async ({ page }) => {
    await page.goto("/admin/produkte");
    expect(await blocking(page)).toEqual([]);
    await page.getByRole("link", { name: "Testkeil mit Dämpfung" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Testkeil mit Dämpfung" })
    ).toBeVisible();
    expect(await blocking(page)).toEqual([]);
    await page.getByRole("button", { name: "Artikel hinzufügen" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await blocking(page)).toEqual([]);
  });

  test("admin pages carry noindex and the demo banner", async ({ page }) => {
    const response = await page.goto("/admin/produkte");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    // Collect every robots meta tag instead of assuming exactly one.
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((tags) => tags.map((t) => t.getAttribute("content") ?? ""));
    expect(robots.some((c) => /noindex/.test(c) && /nofollow/.test(c))).toBe(
      true
    );
    const banner = page.getByRole("region", { name: "Hinweis zur Vorschau" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Vorschau");
  });
});

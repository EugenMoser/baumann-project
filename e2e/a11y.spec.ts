import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/produkte",
  "/produkte/moebelteile",
  "/produkte/moebelteile/testkeil-mit-daempfung",
  "/suche?q=Befestigung",
  "/qualitaet",
  "/anfrage?bestellnummer=99010%20-%201",
];

test.describe("accessibility (SC-15)", () => {
  for (const path of PAGES) {
    test(`no serious or critical axe violations on ${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
        );
      expect(blocking).toEqual([]);
    });
  }

  test("no serious or critical axe violations on the form with errors (SC-14)", async ({
    page,
  }) => {
    await page.goto("/anfrage");
    await page.getByRole("button", { name: /Anfrage prüfen/ }).click();
    await expect(page.getByText(/Namen/).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
      );
    expect(blocking).toEqual([]);
  });
});

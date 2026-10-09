import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/produkte",
  "/produkte/moebelteile",
  "/produkte/moebelteile/testkeil-mit-daempfung",
  "/suche?q=Befestigung",
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
});

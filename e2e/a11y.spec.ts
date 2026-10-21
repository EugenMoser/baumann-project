import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PAGES } from "./pages";

test.describe("accessibility (SC-15)", () => {
  for (const path of PAGES) {
    const tag = path === "/suche" ? " (SC-1)" : "";
    test(`no serious or critical axe violations on ${path}${tag}`, async ({
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

import { expect, test } from "@playwright/test";
import { branding } from "../config/branding";

test.describe("content pages", () => {
  test("quality page shows policy and the seeded certificate (SC-6)", async ({
    page,
  }) => {
    await page.goto("/qualitaet");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Qualitäts- und Umweltpolitik"
    );
    await expect(page.getByText(branding.qualityPolicy[0] ?? "")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ISO 9001 (Beispiel)" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /PDF, Deutsch/ })
    ).toHaveAttribute(
      "href",
      /\/storage\/v1\/object\/public\/catalog\/certificates\/test-iso-9001-de\.pdf$/
    );
    await expect(
      page.getByRole("link", { name: /PDF, Englisch/ })
    ).toHaveAttribute(
      "href",
      /\/catalog\/certificates\/test-iso-9001-en\.pdf$/
    );
  });

  test("footer links imprint and privacy on every page type (SC-1)", async ({
    page,
  }) => {
    for (const path of ["/", "/qualitaet", "/anfrage"]) {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      await expect(
        footer.getByRole("link", { name: "Impressum" })
      ).toHaveAttribute("href", branding.developer.imprintUrl);
      await expect(
        footer.getByRole("link", { name: "Datenschutz" })
      ).toHaveAttribute("href", branding.developer.privacyUrl);
    }
  });
});

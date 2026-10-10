import { expect, test } from "@playwright/test";
import { branding } from "../config/branding";

const paths = ["/", "/qualitaet", "/anfrage", "/diese-seite-gibt-es-nicht"];
const viewports = [
  { width: 1280, height: 800 },
  { width: 360, height: 740 },
];

for (const path of paths) {
  for (const viewport of viewports) {
    test(`demo bar on ${path} at ${viewport.width}px (SC-1)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);

      const banner = page.getByRole("region", { name: "Hinweis zur Vorschau" });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("Vorschau");
      await expect(banner).toContainText("nicht die offizielle Website", {
        useInnerText: true,
      });

      const officialLink = banner.getByRole("link", {
        name: "Zur offiziellen Seite",
      });
      const developerLink = banner.getByRole("link", {
        name: `Umsetzung: ${branding.developer.name}`,
      });
      await expect(officialLink).toBeVisible();
      await expect(officialLink).toHaveAttribute(
        "href",
        branding.officialSiteUrl
      );
      await expect(developerLink).toBeVisible();
      await expect(developerLink).toHaveAttribute(
        "href",
        branding.developer.url
      );

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  }
}

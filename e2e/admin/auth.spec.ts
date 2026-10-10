import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  LOGOUT_ADMIN_EMAIL,
  LOGOUT_ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
} from "./support";

// No storage state: every test starts signed out.
test.describe("admin auth", () => {
  test("redirects to the login page with next (SC-1)", async ({ page }) => {
    await page.goto("/admin/produkte");
    await expect(page).toHaveURL("/admin/login?next=%2Fadmin%2Fprodukte");
  });

  test("wrong password shows the generic message (SC-2)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-Mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Passwort").fill("wrong-password-000");
    await page.getByRole("button", { name: "Anmelden" }).click();
    // Scoped to main: Next's route announcer is an alert as well.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "E-Mail oder Passwort ist falsch."
    );
  });

  test("login lands on next, logout returns to login (SC-2)", async ({
    page,
  }) => {
    await page.goto("/admin/produkte?status=draft");
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    await page.getByLabel("E-Mail").fill(LOGOUT_ADMIN_EMAIL);
    await page.getByLabel("Passwort").fill(LOGOUT_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/admin/produkte?status=draft");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/produkte");
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  });

  test("a non-admin sees the 403 page (SC-1)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-Mail").fill(USER_EMAIL);
    await page.getByLabel("Passwort").fill(USER_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(
      page.getByRole("heading", { name: "Kein Zugriff" })
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("public pages set no auth cookies (SC-1)", async ({ page, context }) => {
    await page.goto("/");
    await page.goto("/produkte/moebelteile/testkeil-mit-daempfung");
    expect(
      (await context.cookies()).filter((c) => c.name.startsWith("sb-"))
    ).toEqual([]);
  });
});

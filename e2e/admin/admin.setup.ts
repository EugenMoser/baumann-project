import { expect, test as setup } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createAdmin,
  LOGOUT_ADMIN_EMAIL,
  LOGOUT_ADMIN_PASSWORD,
  serviceClient,
  STORAGE_STATE,
  USER_EMAIL,
  USER_PASSWORD,
} from "./support";

// Idempotent: every run creates or updates the same three users.
setup("create users and sign in the admin", async ({ page }) => {
  createAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
  createAdmin(LOGOUT_ADMIN_EMAIL, LOGOUT_ADMIN_PASSWORD);

  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === USER_EMAIL);
  const { error: writeError } = user
    ? await svc.auth.admin.updateUserById(user.id, {
        password: USER_PASSWORD,
        app_metadata: { role: null },
      })
    : await svc.auth.admin.createUser({
        email: USER_EMAIL,
        password: USER_PASSWORD,
        email_confirm: true,
      });
  if (writeError) throw writeError;

  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill(ADMIN_EMAIL);
  await page.getByLabel("Passwort").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/admin\/produkte$/);
  await page.context().storageState({ path: STORAGE_STATE });
});

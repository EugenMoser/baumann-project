import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a local run avoid a port that is already taken.
const PORT = Number(process.env.E2E_PORT ?? 3000);
// The standalone server binds HOSTNAME=127.0.0.1, so address it directly.
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /admin\//,
    },
    {
      name: "admin-setup",
      testMatch: /admin\/admin\.setup\.ts/,
      teardown: "admin-teardown",
    },
    { name: "admin-teardown", testMatch: /admin\/admin\.teardown\.ts/ },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      // Admin mutations must never race the public specs.
      dependencies: ["chromium", "admin-setup"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Runs against the standalone production build: run `pnpm build` first.
  webServer: {
    command: "pnpm start:standalone",
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

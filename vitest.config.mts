import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "e2e/**",
      ".claude/**",
      ".superpowers/**",
      "tests/integration/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
    // lib/env validates at import time; unit tests get fixed valid values.
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit_test",
    },
  },
});

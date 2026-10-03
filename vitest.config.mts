import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "e2e/**",
      ".claude/**",
      ".superpowers/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
    // lib/env validates at import time; unit tests get a fixed valid value.
    env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
  },
});

import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

// Keys of the running local stack (`pnpm db:start`).
const status: unknown = JSON.parse(
  execSync("pnpm exec supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
);
if (
  typeof status !== "object" ||
  status === null ||
  !("API_URL" in status) ||
  !("PUBLISHABLE_KEY" in status) ||
  typeof status.API_URL !== "string" ||
  typeof status.PUBLISHABLE_KEY !== "string"
) {
  throw new Error("Local Supabase is not running — run `pnpm db:start`.");
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
    // supabase-js retries failed GETs with backoff (~7 s), which the
    // unreachable-database tests wait out.
    testTimeout: 20_000,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    },
  },
});

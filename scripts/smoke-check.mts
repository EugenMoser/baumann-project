// Post-deploy check: waits until the preview runs the expected commit with a
// reachable database, then verifies the noindex header.
// Usage: node scripts/smoke-check.mts <base-url> <commit-sha>
import { pathToFileURL } from "node:url";
import { z } from "zod";

const healthSchema = z.object({
  commit: z.string(),
  db: z.enum(["ok", "error"]),
});

export function isDeployed(body: unknown, expectedCommit: string): boolean {
  const parsed = healthSchema.safeParse(body);
  return (
    parsed.success &&
    parsed.data.commit === expectedCommit &&
    parsed.data.db === "ok"
  );
}

export function hasNoindexHeader(headers: Headers): boolean {
  const value = headers.get("x-robots-tag");
  if (value === null) return false;
  const directives = value
    .toLowerCase()
    .split(",")
    .map((part) => part.trim());
  return directives.includes("noindex") && directives.includes("nofollow");
}

const TIMEOUT_MS = 10 * 60_000;
const INTERVAL_MS = 15_000;

async function main(): Promise<void> {
  const [baseUrl, expectedCommit] = process.argv.slice(2);
  if (!baseUrl || !expectedCommit) {
    console.error(
      "usage: node scripts/smoke-check.mts <base-url> <commit-sha>"
    );
    process.exit(2);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/health", baseUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      const body: unknown = response.ok ? await response.json() : null;
      if (isDeployed(body, expectedCommit)) {
        const home = await fetch(baseUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!hasNoindexHeader(home.headers)) {
          console.error("X-Robots-Tag: noindex, nofollow is missing on /");
          process.exit(1);
        }
        console.log(
          `Deployed ${expectedCommit}: database ok, noindex header present.`
        );
        return;
      }
      console.log(`Waiting for ${expectedCommit}, got ${JSON.stringify(body)}`);
    } catch (error) {
      console.warn(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  console.error(
    `Timed out after ${TIMEOUT_MS / 60_000} minutes waiting for ${expectedCommit}.`
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

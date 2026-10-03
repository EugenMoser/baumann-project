# Feature 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A preview app that can never be mistaken for the customer's site or indexed, with validated config, test stack, CI and recorded architecture decisions.

**Architecture:** Branding and env are pure, Zod-validated modules imported by the root layout and `next.config.ts`, so invalid values fail the build. `noindex` is applied three times independently (metadata, response header via config, `robots.txt`). The demo bar is a synchronous Server Component rendered by the root layout; unit tests cover pure modules and the component, Playwright covers what the server actually serves.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19.2, TypeScript strict, Tailwind 4, Zod 4, Vitest 5 + Testing Library + jsdom, Playwright 1.63, GitHub Actions, pnpm 10, Node 22.

**Spec:** [`docs/specs/2026-10-03-foundation-design.md`](../specs/2026-10-03-foundation-design.md)

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code — Next 16 differs from older versions (e.g. `error.tsx` receives `retry`, not `reset`).
- TypeScript `strict: true`; no `any`, no non-null assertions (`!`) — narrow explicitly.
- Code, identifiers, comments, commit messages: English. UI copy: German.
- Conventional Commits; WIP commits on the feature branch are allowed. **No push, no PR, no merge to `main` without the developer's approval (Gate 2).**
- Never commit secrets, `.env.local`, source data exports or images.
- The demo bar and all three `noindex` mechanisms must never be removed or weakened. A failing `noindex` test is never "fixed" by loosening the test — report it.
- Package manager: pnpm (`pnpm add`, `pnpm exec`). Node 22.
- UI preview text for the bar (German): "Vorschau · Kundenprojekt in Entwicklung (Vorschau) – nicht die offizielle Website von Tilo Baumann Spritzgussteile e.K." (built from branding values), links "Zur offiziellen Seite" and "Umsetzung: Eugen Moser".
- Header value exactly: `X-Robots-Tag: noindex, nofollow`.
- Spec deviation (YAGNI): `@testing-library/user-event` is not installed in this feature — no test needs interaction yet.
- Work happens in a git worktree on branch `feat/foundation`. `.env.local` is untracked and therefore not present in a new worktree — copy it from the main checkout (`cp ../../../.env.local .` or the absolute path) before Task 2 Step 8 and Task 7.

## Review Focus

1. **Static assets and metadata routes without `X-Robots-Tag`** — a crawler requesting `/_next/static/…`, `/favicon.ico` or `/robots.txt` must also get the header. Pinned in Task 4 (SC-3 test fetches a real `/_next/static/` script). If `headers()` does not cover a path, stop and report instead of excluding it.
2. **Empty or non-HTTP site URL** (`NEXT_PUBLIC_SITE_URL=""` or `ftp://…`) — must fail the build, not produce broken absolute URLs. Pinned in Task 2.
3. **Narrow phones (360 px) with the long company name** — the bar must not cause horizontal scrolling and both links must stay visible. Pinned in Task 4 (SC-1 at 360 px checks overflow and link visibility).
4. **404 responses** — must return HTTP 404 _and_ still show the bar and `noindex`. Pinned in Task 4 (status assertion + banner + meta on a non-existent path).
5. **Runtime errors inside a page** — the segment error page renders inside the root layout and therefore keeps the bar. `app/error.tsx` is created in Task 3; there is no route that throws yet, so this is verified by review (the file lives under `app/`, not as `global-error.tsx`).

---

## File Structure

| File                                                         | Responsibility                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `config/branding.ts`                                         | Branding values + Zod schema; single source for names and links           |
| `config/branding.test.ts`                                    | Unit tests SC-5 (schema)                                                  |
| `lib/env.ts`                                                 | Env schema + `parseEnv`; exports validated `env`                          |
| `lib/env.test.ts`                                            | Unit tests SC-6                                                           |
| `components/demo-banner.tsx`                                 | Demo notice bar (sync Server Component, props-driven)                     |
| `components/demo-banner.test.tsx`                            | Unit tests SC-5 (rendering) / FR-1                                        |
| `app/layout.tsx`                                             | Root layout: bar, `lang="de"`, metadata incl. `robots` and `metadataBase` |
| `app/page.tsx`                                               | Placeholder home page                                                     |
| `app/not-found.tsx`                                          | 404 page                                                                  |
| `app/error.tsx`                                              | Segment error boundary (client)                                           |
| `app/robots.ts`                                              | `Disallow: /` for all agents                                              |
| `next.config.ts`                                             | Imports env validation; `headers()` adds `X-Robots-Tag`                   |
| `vitest.config.mts`, `vitest.setup.ts`                       | Vitest config (jsdom, includes `*.test.ts(x)`, excludes `e2e/`)           |
| `playwright.config.ts`                                       | Playwright config (Chromium, `pnpm start` web server)                     |
| `e2e/demo-banner.spec.ts`                                    | E2E SC-1                                                                  |
| `e2e/noindex.spec.ts`                                        | E2E SC-2, SC-3, SC-4                                                      |
| `.github/workflows/ci.yml`                                   | CI (FR-7)                                                                 |
| `.env.example`                                               | Placeholders only                                                         |
| `.gitignore`                                                 | Allow `.env.example`; ignore Playwright output                            |
| `README.md`                                                  | Short placeholder with preview notice (FR-9)                              |
| `docs/decisions/0001-data-access.md` … `0004-ai-provider.md` | ADRs (FR-8, FR-10)                                                        |
| `docs/ai-workflow.md`                                        | AI workflow skeleton (FR-8)                                               |

Deleted: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`.

---

### Task 1: Test stack and branding config

**Files:**

- Create: `vitest.config.mts`, `vitest.setup.ts`, `config/branding.ts`, `config/branding.test.ts`
- Modify: `package.json` (dependencies, `test` script)

**Interfaces:**

- Produces: `brandingSchema` (Zod object), `type Branding`, `const branding: Branding` from `@/config/branding`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add zod
pnpm add -D @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom @vitejs/plugin-react vite-tsconfig-paths
```

Expected: zod 4.x, @testing-library/react 16.x, jsdom 30.x, @vitejs/plugin-react 6.x, vite-tsconfig-paths 6.x.

- [ ] **Step 2: Create `vitest.config.mts`**

```ts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
    // lib/env validates at import time; unit tests get a fixed valid value.
    env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

If `@testing-library/jest-dom/vitest` does not resolve with jest-dom 7, check the package's `exports` in `node_modules/@testing-library/jest-dom/package.json` and use the documented Vitest entry point.

- [ ] **Step 4: Change the `test` script** in `package.json` from `"vitest run --passWithNoTests"` to `"vitest run"` (tests exist from now on; an accidentally empty suite must fail).

- [ ] **Step 5: Write the failing test `config/branding.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { branding, brandingSchema } from "./branding";

const valid = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  developer: { name: "Dev Person", url: "https://dev.example" },
};

describe("brandingSchema (FR-5, SC-5)", () => {
  it("accepts the shipped branding", () => {
    expect(brandingSchema.safeParse(branding).success).toBe(true);
  });

  it("accepts a complete valid object", () => {
    expect(brandingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty company name", () => {
    expect(
      brandingSchema.safeParse({ ...valid, companyName: "" }).success
    ).toBe(false);
  });

  it("rejects an invalid official site URL", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        officialSiteUrl: "baumann-entwicklungen",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid developer URL", () => {
    expect(
      brandingSchema.safeParse({
        ...valid,
        developer: { name: "Dev", url: "not a url" },
      }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Run and verify it fails**

Run: `pnpm exec vitest run config/branding.test.ts`
Expected: FAIL — cannot resolve `./branding`.

- [ ] **Step 7: Implement `config/branding.ts`**

```ts
import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

export const brandingSchema = z.object({
  companyName: z.string().min(1),
  shortName: z.string().min(1),
  officialSiteUrl: httpUrl,
  previewLabel: z.string().min(1),
  developer: z.object({
    name: z.string().min(1),
    url: httpUrl,
  }),
});

export type Branding = z.infer<typeof brandingSchema>;

// Single source for customer and developer names/links. On revocation this
// object is replaced with placeholders (see docs/data-model.md, "Removal").
export const branding: Branding = brandingSchema.parse({
  companyName: "Tilo Baumann Spritzgussteile e.K.",
  shortName: "Baumann",
  officialSiteUrl: "https://www.baumann-entwicklungen.de",
  previewLabel: "Kundenprojekt in Entwicklung (Vorschau)",
  developer: { name: "Eugen Moser", url: "https://eugen-moser.com" },
});
```

- [ ] **Step 8: Run and verify it passes**

Run: `pnpm exec vitest run config/branding.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.mts vitest.setup.ts config/
git commit -m "feat: add validated branding config and vitest setup"
```

---

### Task 2: Env schema and build-time validation

**Files:**

- Create: `lib/env.ts`, `lib/env.test.ts`, `.env.example`
- Modify: `next.config.ts`, `.gitignore`

**Interfaces:**

- Produces: `parseEnv(source: Record<string, string | undefined>): Env`, `type Env = { NEXT_PUBLIC_SITE_URL: string }`, `const env: Env` from `@/lib/env`.

- [ ] **Step 1: Write the failing test `lib/env.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv (FR-6, SC-6)", () => {
  it("parses a valid https site URL", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SITE_URL: "https://baumann.eugen-moser.com",
    });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://baumann.eugen-moser.com");
  });

  it("accepts http for local development", () => {
    expect(
      parseEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
        .NEXT_PUBLIC_SITE_URL
    ).toBe("http://localhost:3000");
  });

  it("throws a readable error naming the variable when it is missing", () => {
    expect(() => parseEnv({})).toThrow(
      /Invalid environment variables[\s\S]*NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws when the value is empty", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws when the value is not a URL", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/
    );
  });

  it("throws for a non-http protocol", () => {
    expect(() =>
      parseEnv({ NEXT_PUBLIC_SITE_URL: "ftp://example.com" })
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm exec vitest run lib/env.test.ts`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 3: Implement `lib/env.ts`**

```ts
import { z } from "zod";

// Server-only variables are added here in later features (Supabase: feature 2,
// AI: feature 7). Public variables must be read explicitly below so Next.js can
// inline them; never pass `process.env` as a whole.
const serverSchema = z.object({});

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
});

const envSchema = serverSchema.extend(publicSchema.shape);

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

export const env: Env = parseEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm exec vitest run lib/env.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Validate env at build time** — replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";
// Side-effect import: throws during `next build`/`next start` if env is invalid.
import "./lib/env";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
```

- [ ] **Step 6: Allow `.env.example` in git** — in `.gitignore`, directly below the line `.env*`, add:

```
!.env.example
```

- [ ] **Step 7: Create `.env.example`**

```bash
# Copy to .env.local and fill in. Never commit real values.

# Public base URL of the app (http allowed only for local development)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 8: Create a local `.env.local`** (not committed) with `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, then verify the build-time failure and success:

Run: `NEXT_PUBLIC_SITE_URL=not-a-url pnpm build`
Expected: build aborts with `Invalid environment variables:` and `- NEXT_PUBLIC_SITE_URL: …`.

Run: `pnpm build`
Expected: build succeeds.

Run: `git status --short`
Expected: `.env.example` listed, `.env.local` not listed.

- [ ] **Step 9: Commit**

```bash
git add lib/ next.config.ts .gitignore .env.example
git commit -m "feat: validate environment variables at build time"
```

---

### Task 3: Demo bar, root layout and boilerplate removal

**Files:**

- Create: `components/demo-banner.tsx`, `components/demo-banner.test.tsx`, `app/not-found.tsx`, `app/error.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`, `README.md`
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

**Interfaces:**

- Consumes: `type Branding`, `branding` (Task 1); `env` (Task 2).
- Produces: `DemoBanner({ branding }: { branding: Branding }): JSX.Element` from `@/components/demo-banner`; accessible region name `"Hinweis zur Vorschau"`; link names `"Zur offiziellen Seite"` and `` `Umsetzung: ${branding.developer.name}` `` (used by Task 4 E2E).

- [ ] **Step 1: Write the failing test `components/demo-banner.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Branding } from "@/config/branding";
import { DemoBanner } from "./demo-banner";

const fixture: Branding = {
  companyName: "Example GmbH",
  shortName: "Example",
  officialSiteUrl: "https://example.com",
  previewLabel: "Testprojekt (Vorschau)",
  developer: { name: "Dev Person", url: "https://dev.example" },
};

describe("DemoBanner (FR-1, SC-5)", () => {
  it("renders the preview notice from the branding config", () => {
    render(<DemoBanner branding={fixture} />);
    const banner = screen.getByRole("region", { name: "Hinweis zur Vorschau" });
    expect(banner).toHaveTextContent("Vorschau");
    expect(banner).toHaveTextContent("Testprojekt (Vorschau)");
    expect(banner).toHaveTextContent("Example GmbH");
  });

  it("links to the official site and to the developer", () => {
    render(<DemoBanner branding={fixture} />);
    expect(
      screen.getByRole("link", { name: "Zur offiziellen Seite" })
    ).toHaveAttribute("href", "https://example.com");
    expect(
      screen.getByRole("link", { name: "Umsetzung: Dev Person" })
    ).toHaveAttribute("href", "https://dev.example");
  });

  it("cannot be dismissed", () => {
    render(<DemoBanner branding={fixture} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm exec vitest run components/demo-banner.test.tsx`
Expected: FAIL — cannot resolve `./demo-banner`.

- [ ] **Step 3: Implement `components/demo-banner.tsx`**

```tsx
import type { Branding } from "@/config/branding";

type DemoBannerProps = {
  branding: Branding;
};

// Always visible and not dismissible: the preview uses real customer data and
// must never be mistaken for the official website.
export function DemoBanner({ branding }: DemoBannerProps) {
  return (
    <section
      aria-label="Hinweis zur Vorschau"
      className="w-full bg-amber-300 text-sm text-amber-950"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <p className="min-w-0">
          <span className="font-semibold">Vorschau</span>
          <span className="hidden sm:inline">
            {" "}
            · {branding.previewLabel} – nicht die offizielle Website von{" "}
            {branding.companyName}.
          </span>
          <span className="sm:hidden"> – nicht die offizielle Website</span>
        </p>
        <nav aria-label="Links zur Vorschau" className="flex flex-wrap gap-x-4">
          <a
            href={branding.officialSiteUrl}
            className="underline underline-offset-2"
          >
            Zur offiziellen Seite
          </a>
          <a
            href={branding.developer.url}
            className="underline underline-offset-2"
          >
            Umsetzung: {branding.developer.name}
          </a>
        </nav>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm exec vitest run components/demo-banner.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { branding } from "@/config/branding";
import { env } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${branding.companyName} – Vorschau`,
    template: `%s – ${branding.shortName} (Vorschau)`,
  },
  description: `${branding.previewLabel}: Produktkatalog von ${branding.companyName}.`,
  // The preview must never be indexed (see also next.config.ts and app/robots.ts).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <DemoBanner branding={branding} />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Replace `app/page.tsx`**

```tsx
import { branding } from "@/config/branding";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">{branding.companyName}</h1>
      <p>
        Der Produktkatalog wird gerade aufgebaut. Diese Vorschau wächst
        schrittweise.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Create `app/not-found.tsx`**

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <Link href="/" className="underline underline-offset-2">
        Zur Startseite
      </Link>
    </main>
  );
}
```

- [ ] **Step 8: Create `app/error.tsx`** (Next 16 passes `retry`, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`)

```tsx
"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

// Lives under app/ (not global-error) so it renders inside the root layout
// and keeps the demo bar.
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold">Etwas ist schiefgelaufen</h1>
      <button
        type="button"
        onClick={() => retry()}
        className="w-fit underline underline-offset-2"
      >
        Erneut versuchen
      </button>
    </main>
  );
}
```

- [ ] **Step 9: Delete boilerplate assets**

```bash
git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

Keep `app/favicon.ico`.

- [ ] **Step 10: Replace `README.md`**

```markdown
# Baumann — product catalog (preview)

> **Client project in development (preview).** This is not the official website
> of Tilo Baumann Spritzgussteile e.K. The preview is not indexed by search engines.

Rebuild of a product catalog for an injection-moulding manufacturer as a dynamic
Next.js + Supabase web app with an admin area and an AI text assistant.

- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- Data model: [docs/data-model.md](docs/data-model.md)

A full README follows with the showcase feature.
```

- [ ] **Step 11: Verify**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all exit 0.

Run: `ls public`
Expected: empty or no SVG files from create-next-app.

- [ ] **Step 12: Commit**

```bash
git add components/ app/ README.md
git commit -m "feat: add demo notice bar and replace create-next-app boilerplate"
```

---

### Task 4: noindex everywhere and E2E tests

**Files:**

- Create: `app/robots.ts`, `playwright.config.ts`, `e2e/demo-banner.spec.ts`, `e2e/noindex.spec.ts`
- Modify: `next.config.ts`, `package.json` (script `e2e`), `.gitignore`

**Interfaces:**

- Consumes: `branding` (Task 1); region/link names from Task 3; metadata `robots` from Task 3.
- Produces: `pnpm e2e` script used by CI (Task 5).

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs against the production build: run `pnpm build` first.
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add script and ignores** — in `package.json` scripts add `"e2e": "playwright test"`. Append to `.gitignore`:

```
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 4: Write the failing test `e2e/noindex.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

const MISSING_PATH = "/diese-seite-gibt-es-nicht";

test.describe("noindex", () => {
  for (const path of ["/", MISSING_PATH]) {
    test(`meta robots noindex, nofollow on ${path} (SC-2)`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      if (path === MISSING_PATH) {
        expect(response?.status()).toBe(404);
      }
      const content = await page
        .locator('meta[name="robots"]')
        .getAttribute("content");
      expect(content).toMatch(/noindex/);
      expect(content).toMatch(/nofollow/);
    });
  }

  test("X-Robots-Tag on pages, metadata routes and static assets (SC-3)", async ({
    page,
    request,
  }) => {
    for (const url of ["/", MISSING_PATH, "/robots.txt", "/favicon.ico"]) {
      const response = await request.get(url);
      expect(response.headers()["x-robots-tag"], url).toBe("noindex, nofollow");
    }

    await page.goto("/");
    const scriptSrc = await page
      .locator('script[src^="/_next/static/"]')
      .first()
      .getAttribute("src");
    if (scriptSrc === null) {
      throw new Error("No /_next/static script found on the home page");
    }
    const asset = await request.get(scriptSrc);
    expect(asset.headers()["x-robots-tag"], scriptSrc).toBe(
      "noindex, nofollow"
    );
  });

  test("robots.txt disallows all crawlers (SC-4)", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/^User-Agent: \*$/im);
    expect(body).toMatch(/^Disallow: \/$/m);
  });
});
```

- [ ] **Step 5: Write the test `e2e/demo-banner.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { branding } from "../config/branding";

const paths = ["/", "/diese-seite-gibt-es-nicht"];
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
```

- [ ] **Step 6: Run and verify the expected failures**

Run: `pnpm build && pnpm e2e`
Expected: `demo-banner.spec.ts` PASS (Task 3 is done); in `noindex.spec.ts` the SC-2 tests PASS (metadata from Task 3), SC-3 FAILS (header missing), SC-4 FAILS (404 for `/robots.txt`).

- [ ] **Step 7: Add the header** — in `next.config.ts`, extend `nextConfig`:

```ts
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Applies to every response independent of page code, incl. assets and errors.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};
```

- [ ] **Step 8: Create `app/robots.ts`**

```ts
import type { MetadataRoute } from "next";

// Preview only: no crawler may access any path.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
```

- [ ] **Step 9: Run and verify everything passes**

Run: `pnpm build && pnpm e2e`
Expected: all E2E tests PASS (4 × SC-1, 2 × SC-2, SC-3, SC-4).
If SC-3 fails only for `/_next/static/…` or `/favicon.ico`: stop, do not weaken the test, report as a blocker with the observed headers.

- [ ] **Step 10: Run the full local check**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all exit 0 (Vitest must not pick up `e2e/*.spec.ts`).

- [ ] **Step 11: Commit**

```bash
git add app/robots.ts next.config.ts playwright.config.ts e2e/ package.json pnpm-lock.yaml .gitignore
git commit -m "feat: enforce noindex via header and robots.txt with e2e coverage"
```

---

### Task 5: CI workflow

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: scripts `lint`, `typecheck`, `test`, `build`, `e2e` (Tasks 1–4).

- [ ] **Step 1: Create `.github/workflows/ci.yml`** (action majors verified on 2026-10-03: checkout v7, setup-node v7, pnpm/action-setup v6, gitleaks-action v3, upload-artifact v7)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_PUBLIC_SITE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Secret scan
        uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

      - name: Install Playwright browser
        run: pnpm exec playwright install --with-deps chromium

      - run: pnpm e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

`pnpm/action-setup` reads the version from `packageManager` in `package.json`. Check each action's README for input changes in its current major before finishing (e.g. whether `gitleaks-action` v3 still reads `GITHUB_TOKEN`); adjust inputs, not the step list.

- [ ] **Step 2: Validate the workflow syntax locally**

Run: `pnpm dlx @action-validator/cli .github/workflows/ci.yml`
Expected: exit 0. If the validator is unavailable, run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` and note in the report that only YAML syntax was checked.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, test, build and e2e workflow"
```

- [ ] **Step 4: SC-7 evidence — only after the developer approves push and PR at Gate 2.** Then:

```bash
git remote add origin git@github.com:EugenMoser/baumann-project.git
git push -u origin main
git push -u origin <feature-branch>
gh pr create --draft --base main --title "feat: foundation (feature 1)" --body-file <gate-2-report>
gh pr checks --watch
```

Expected: CI green. Then push one commit with a deliberately failing assertion, confirm the run turns red (`gh pr checks`), and revert that commit with a new commit. Record both run URLs in the PR.

---

### Task 6: ADRs and AI workflow skeleton

**Files:**

- Create: `docs/decisions/0001-data-access.md`, `docs/decisions/0002-deploy.md`, `docs/decisions/0003-test-stack.md`, `docs/decisions/0004-ai-provider.md`, `docs/ai-workflow.md`

**Interfaces:**

- Consumes: decisions in the spec, section "Decisions".
- Produces: ADR 0004 with a "Model choice" section that Task 7 fills in.

- [ ] **Step 1: Write the four ADRs** using this structure each (content taken verbatim in substance from the spec section "Decisions", ADR 0001–0004):

```markdown
# ADR 000N — <title>

- **Status:** accepted (2026-10-03)
- **Feature:** <where it is implemented>

## Context

<the problem and constraints, 3–6 sentences>

## Decision

<the decision as bullet points>

## Alternatives considered

<each rejected option with the reason>

## Consequences

<positive and negative consequences, incl. follow-up work>
```

Required content per ADR:

- **0001 Data access:** supabase-js with anon key + user JWT so RLS is the security boundary; schema/RLS/views/functions/triggers as hand-written PostgreSQL migrations via Supabase CLI; generated types; complex reads as views/RPC; import/removal scripts via direct Postgres driver, server-side only. Alternatives: Drizzle, Prisma, direct driver for the app (all bypass RLS without per-transaction role/claims). Consequence: SQL skills needed; RLS testable with pgTAP.
- **0002 Deploy:** Coolify on the existing VPS, GitHub App source, Auto Deploy off, authenticated deploy webhook called from CI after green checks on `main`; Dockerfile with `output: "standalone"`; Traefik TLS. Alternative: build in Actions → GHCR (kept as fallback if VPS builds become a bottleneck). Consequence: builds share 2 vCPU with Supabase.
- **0003 Test stack:** Vitest + RTL (jsdom) for units and sync components; Playwright for E2E against the production build; pgTAP via `supabase test db` from feature 2; TDD with FR/SC mapping. Alternative: RLS tests in Vitest (rejected: learning goal Postgres, tests close to policies).
- **0004 AI provider:** AI SDK + `@openrouter/ai-sdk-provider`, model via env, free model first with paid fallback, OpenRouter key limit + app counter, `data_collection: "deny"` before non-public data. Leave a section `## Model choice` with the sentence "Filled in by the spike (FR-10)." — Task 7 replaces it.

- [ ] **Step 2: Write `docs/ai-workflow.md`** with these sections (skeleton; completed in feature 8):

```markdown
# AI-assisted workflow

How this project is planned, built and reviewed with AI agents — and what stays
a human decision.

## Roles

| Step           | Human                                            | AI                                                                                             |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Roadmap        | Sets goals, scope, priorities; approves (Gate 0) | Decomposes, estimates, lists risks                                                             |
| Spec           | Answers questions, approves (Gate 1)             | Asks one question at a time, proposes approaches, writes the spec with FR/SC IDs               |
| Plan           | Approves (feature 1 only)                        | Writes a task-by-task plan with tests                                                          |
| Implementation | —                                                | Test-writer writes failing tests; implementer makes them pass; WIP commits on a feature branch |
| Review         | Final review, merge decision (Gate 2)            | Code-reviewer and security-reviewer agents                                                     |

## Flow

Roadmap → spec → plan → TDD → review → PR → merge.

## Artifacts

| Artifact            | Location                               |
| ------------------- | -------------------------------------- |
| Roadmap             | `docs/roadmap.md`                      |
| Data model          | `docs/data-model.md`                   |
| Specs               | `docs/specs/`                          |
| Plans               | `docs/plans/`                          |
| Decisions           | `docs/decisions/`                      |
| Agent configuration | `CLAUDE.md`, `.claude/`                |
| Review results      | Pull request descriptions and comments |

## Guardrails

- Pre-commit: gitleaks, lint-staged, typecheck, tests.
- CI on every PR.
- No commit, push or merge without human approval.
```

- [ ] **Step 3: Format and check links**

Run: `pnpm exec prettier --write docs/ && grep -o '](\.\./[^)]*\|](docs/[^)]*' -r docs README.md`
Expected: every referenced path exists (`ls` each one).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions docs/ai-workflow.md
git commit -m "docs: add architecture decision records and ai workflow skeleton"
```

---

### Task 7: AI model spike (FR-10)

**Files:**

- Create (not committed): `.claude/work/spike-ai-model/spike.mjs`, `.claude/work/spike-ai-model/results.md`
- Modify: `docs/decisions/0004-ai-provider.md` (section "Model choice")

**Prerequisite:** `OPENROUTER_API_KEY` in `.env.local` (provided by the developer). If missing, stop and ask — do not create a key or account.

- [ ] **Step 1: List candidate models**

```bash
curl -s https://openrouter.ai/api/v1/models \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; [print(m['id'], m.get('context_length'), ','.join(m.get('supported_parameters',[]))) for m in d if m['id'].endswith(':free') and 'structured_outputs' in m.get('supported_parameters',[])]"
```

Pick 2–3 free models that list `structured_outputs`, preferring larger instruction-tuned models. If none qualifies, pick the 2 cheapest paid models that do and note this in the ADR.

- [ ] **Step 2: Write the spike script** `.claude/work/spike-ai-model/spike.mjs` (plain `fetch`, no new dependencies). It must:
  - read `OPENROUTER_API_KEY` from `.env.local` (parse the file; never print the key),
  - take 3 products from the legacy CSV exports (path passed as CLI argument, outside the repo): one with a single article, one with several heights, one with several colours and pipe diameters,
  - call `POST https://openrouter.ai/api/v1/chat/completions` per model and product with `response_format: { type: "json_schema", json_schema: { name: "product_copy", strict: true, schema: { type: "object", additionalProperties: false, required: ["description", "seoTitle", "seoDescription"], properties: { description: { type: "string" }, seoTitle: { type: "string", maxLength: 60 }, seoDescription: { type: "string", maxLength: 155 } } } } }` and a German system prompt ("Schreibe sachliche Produkttexte für einen B2B-Katalog. Erfinde keine Eigenschaften, Preise oder Normen; nutze nur die gelieferten Daten."),
  - record per call: model, product, latency (ms), whether the JSON parsed and matched the schema (lengths included), and the output,
  - write everything to `results.md`.

- [ ] **Step 3: Run it**

Run: `node .claude/work/spike-ai-model/spike.mjs <path-to-exports>`
Expected: `results.md` with 6–9 results.

- [ ] **Step 4: Assess and record** — replace the "Model choice" section of ADR 0004 with: date, candidate models, the 3 test products (names only), a table (model × schema adherence × language quality 1–5 × invented facts yes/no × median latency), the chosen primary model, the fallback model, and the limits observed (rate limit, availability). No API keys, no raw prompts containing anything but public catalog data.

- [ ] **Step 5: Commit** (ADR only — the spike folder stays uncommitted)

```bash
git add docs/decisions/0004-ai-provider.md
git commit -m "docs: record ai model choice from spike"
```

---

## Verification before Gate 2

Run and paste outputs with exit codes into the Gate-2 report:

```bash
pnpm lint; echo "lint exit $?"
pnpm typecheck; echo "typecheck exit $?"
pnpm test; echo "test exit $?"
pnpm build; echo "build exit $?"
pnpm e2e; echo "e2e exit $?"
```

SC mapping for the report:

| SC    | Evidence                                                                |
| ----- | ----------------------------------------------------------------------- |
| SC-1  | `e2e/demo-banner.spec.ts` (4 tests)                                     |
| SC-2  | `e2e/noindex.spec.ts` meta tests (2)                                    |
| SC-3  | `e2e/noindex.spec.ts` header test                                       |
| SC-4  | `e2e/noindex.spec.ts` robots test                                       |
| SC-5  | `config/branding.test.ts`, `components/demo-banner.test.tsx`            |
| SC-6  | `lib/env.test.ts` + failing `NEXT_PUBLIC_SITE_URL=not-a-url pnpm build` |
| SC-7  | CI run URLs (green + deliberately red) after Gate-2 approval            |
| SC-8  | ADR files + `docs/ai-workflow.md` reviewed                              |
| SC-9  | `ls public`, README notice                                              |
| SC-10 | ADR 0004 "Model choice"                                                 |

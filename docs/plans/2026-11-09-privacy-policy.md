# Feature 5b — Privacy Policy Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A German privacy policy at `/datenschutz` that describes exactly what this app processes, linked from the footer and the inquiry form, with tests that pin the facts it states.

**Architecture:** One static Server Component page in the `(site)` layout; one small module with the internal legal paths; the branding loses `developer.privacyUrl` and gains `developer.email`. E2E specs pin "no cookie on public pages" and "no third-party request". The text is reviewed by independent agents before Gate 2.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, Vitest + Testing Library, Playwright, pnpm.

**Spec:** `docs/specs/2026-11-09-privacy-policy-design.md` (Appendix A is the page text).

**Branch / worktree:** `feat/privacy-policy`, created from `main` (c689631). The spec and this plan are untracked in the main checkout; Task 4 copies them into the worktree.

## Global Constraints

- Page text: Appendix A of the spec, verbatim, German; headings in that order; "Stand: November 2026" last.
- Server-log sentence verbatim: "Fehlermeldungen des Servers können Ihre IP-Adresse enthalten. Sie werden spätestens nach 30 Tagen gelöscht, auch in den Sicherungen."
- Controller: `branding.developer.name`, `branding.developer.email` (`info@eugen-moser.com`, `mailto:` link), imprint link `branding.developer.imprintUrl`; no postal address anywhere in the repo.
- No customer name in the page; the page renders the same with `placeholderBranding`.
- Never remove the demo notice or `noindex` (meta, `X-Robots-Tag`, `robots.txt`).
- The form checkbox stays required; nothing calls it consent.
- TDD: failing test first, then code. Package manager pnpm.

## Review Focus

1. Visiting `/admin/login` (no login) and then a public page must leave no cookie — Task 3, test "login page alone sets no cookie".
2. The form's privacy link must land on the inquiry section — Task 3, test "form privacy link opens the inquiry section".
3. Long URLs in the text (Hostinger DPA, EUR-Lex) must not overflow at 360 px — Task 2 (`break-all` on URL links) and Task 3 (page in `e2e/pages.ts`, layout spec).
4. A no-JS form submit must not set a cookie either — Task 3, cookie test submits once with JavaScript disabled.
5. The page must not name the customer when the customer branding is active — Task 2, test "names no customer".

---

### Task 1: Internal legal paths, branding and links

**Model / effort:** Sonnet, medium

**Files:**

- Create: `lib/legal.ts`
- Modify: `config/branding.ts` (schema `developer`, both brandings), `config/branding.test.ts`, `components/demo-banner.test.tsx` (fixture), `components/site/site-footer.tsx`, `components/site/site-footer.test.tsx`, `components/inquiry/inquiry-form.tsx` (prop `privacyUrl` removed), `components/inquiry/inquiry-form.test.tsx`, `app/(site)/anfrage/page.tsx`, `e2e/content.spec.ts`

**Interfaces:**

- Produces (`lib/legal.ts`):
  - `export const PRIVACY_PATH = "/datenschutz";`
  - `export const INQUIRY_PRIVACY_ANCHOR = "anfrageformular";`
  - `export const INQUIRY_PRIVACY_HREF = \`${PRIVACY_PATH}#${INQUIRY_PRIVACY_ANCHOR}\`;`
- Produces (`Branding`): `developer: { name: string; url: string; imprintUrl: string; email: string }` — `email` validated with `z.email()`; `privacyUrl` removed. Both brandings: `email: "info@eugen-moser.com"`.
- `InquiryForm` props: `{ action, initialState, prefill, officialSiteUrl }` (no `privacyUrl`); the label link uses `INQUIRY_PRIVACY_HREF`.

- [ ] **Step 1: Write the failing tests**
  - `config/branding.test.ts`: fixture `developer` gets `email: "dev@example.com"` and loses `privacyUrl`; the `it.each` over URL keys runs over `["imprintUrl"]` only; new test `"rejects a developer without a valid e-mail (5b SC-2)"`: missing `email` and `email: "kein-mail"` both fail `safeParse`; new test `"ships info@eugen-moser.com in both brandings (5b D2)"` on `branding` and `placeholderBranding`.
  - `components/site/site-footer.test.tsx`: "Datenschutz" `href` is `"/datenschutz"` (import `PRIVACY_PATH`); "Impressum" stays `placeholderBranding.developer.imprintUrl`. Test name gets `(5b SC-2)`.
  - `components/inquiry/inquiry-form.test.tsx`: `PROPS` loses `privacyUrl`; the consent-link test expects `href` `"/datenschutz#anfrageformular"` (import `INQUIRY_PRIVACY_HREF`) and that the checkbox is `required`-validated as before (existing test stays).
  - `components/demo-banner.test.tsx`: fixture `developer` like the branding test.
  - `e2e/content.spec.ts`, footer test: "Datenschutz" `href` is `"/datenschutz"`; add `/datenschutz` to its path list once Task 2 exists (leave the list as is here).

- [ ] **Step 2: Run to verify they fail**

  Run: `pnpm test config/branding.test.ts components/site/site-footer.test.tsx components/inquiry/inquiry-form.test.tsx components/demo-banner.test.tsx`
  Expected: FAIL (missing module `@/lib/legal`, schema still has `privacyUrl`).

- [ ] **Step 3: Implement**
  - `lib/legal.ts` with the three constants above.
  - `config/branding.ts`: schema `developer.email: z.email()`, remove `privacyUrl`; the comment above `imprintUrl` reads "The developer operates the preview; the imprint is theirs, the privacy policy is a page of this app (feature 5b)."; both brandings get `email`, lose `privacyUrl`.
  - `site-footer.tsx`: the "Datenschutz" link becomes `<Link href={PRIVACY_PATH}>` with the same classes.
  - `inquiry-form.tsx`: drop the `privacyUrl` prop; the label link becomes `<Link href={INQUIRY_PRIVACY_HREF}>` with the existing classes and text "Datenschutzhinweise".
  - `app/(site)/anfrage/page.tsx`: stop passing `privacyUrl`.

- [ ] **Step 4: Run to verify they pass**

  Run: same command as Step 2, then `pnpm typecheck && pnpm lint`
  Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

  `git add lib/legal.ts config/branding.ts config/branding.test.ts components/demo-banner.test.tsx components/site/site-footer.tsx components/site/site-footer.test.tsx components/inquiry/inquiry-form.tsx components/inquiry/inquiry-form.test.tsx "app/(site)/anfrage/page.tsx" e2e/content.spec.ts`
  `git commit -m "feat: link the privacy policy inside the app"`

### Task 2: Privacy policy page

**Model / effort:** Sonnet, medium

**Files:**

- Create: `app/(site)/datenschutz/page.tsx`, `app/(site)/datenschutz/page.test.tsx`
- Modify: `lib/inquiry/schema.test.ts`

**Interfaces:**

- Consumes: `INQUIRY_PRIVACY_ANCHOR` from `lib/legal.ts`; `branding.developer.{name,email,imprintUrl}` (Task 1).
- Produces: default export `PrivacyPage(): JSX.Element` (synchronous, no data access, no `connection()`), `export const metadata: Metadata = { title: "Datenschutz", description: "Welche Daten diese Vorschau verarbeitet und welche Rechte Sie haben." }`.

- [ ] **Step 1: Write the failing tests** (`app/(site)/datenschutz/page.test.tsx`, names carry the 5b IDs)
  - `"renders the headings of Appendix A in order (SC-1, FR-1)"`: `getAllByRole("heading", { level: 2 }).map(h => h.textContent)` equals `["Verantwortlicher", "Überblick", "Hosting", "Aufruf der Website", "Anfrageformular", "Admin-Bereich", "Ihre Rechte", "Widerspruchsrecht (Art. 21 DSGVO)", "Beschwerderecht"]`; `h1` is "Datenschutzerklärung".
  - `"states the server-log sentence verbatim (SC-1)"`: `getByText` (substring matcher) finds the global-constraint sentence.
  - `"links the e-mail and the imprint (SC-1, FR-2)"`: a link named `info@eugen-moser.com` with `href` `mailto:info@eugen-moser.com` (at least one); link "Impressum" with `href` `branding.developer.imprintUrl`.
  - `"marks the inquiry section with its anchor (FR-4)"`: `document.getElementById("anfrageformular")` contains the heading "Anfrageformular".
  - `"emphasises the Art. 21 section (FR-1)"`: the paragraph starting "Soweit ich Daten" has class `font-medium`.
  - `"names no customer (FR-6)"`: page text contains neither `branding.companyName` nor `branding.shortName` as a word (`branding` is the customer branding in the repo).
  - `"ends with the date line"`: text "Stand: November 2026" present.
  - `lib/inquiry/schema.test.ts`, new test `"requires exactly the fields the privacy policy lists (5b SC-5)"`: `inquirySchema.safeParse` of all-empty strings fails with issue paths (as a set) `{"name", "email", "privacy", "message"}`; `{ ...empty, name: "Er", email: "e@example.com", message: "x", privacy: "on" }` passes; the same with `orderNumber: "1"` and `message: ""` passes.

- [ ] **Step 2: Run to verify they fail**

  Run: `pnpm test "app/(site)/datenschutz" lib/inquiry/schema.test.ts`
  Expected: page tests FAIL (module not found); the schema test PASSES already (it pins existing behaviour; note this in the task report).

- [ ] **Step 3: Implement `app/(site)/datenschutz/page.tsx`**

  Layout like the quality page: `<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">`, `PageHeader` with `eyebrow="Rechtliches"` and `title="Datenschutzerklärung"`; one `<section>` per `h2` (`text-xl font-semibold tracking-tight`), paragraphs `max-w-prose`. Text from Appendix A verbatim; the controller block uses the branding values; the inquiry section has `id={INQUIRY_PRIVACY_ANCHOR}` and `scroll-mt-24`; the Art. 21 section has `border-l-4 border-ink pl-4` and its paragraph `font-medium`. The two external URLs are links whose text is the URL, with `break-all`. No customer name, no branding fields except `developer`.

- [ ] **Step 4: Run to verify they pass**

  Run: `pnpm test "app/(site)/datenschutz" lib/inquiry/schema.test.ts && pnpm typecheck && pnpm lint`
  Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

  `git add "app/(site)/datenschutz" lib/inquiry/schema.test.ts`
  `git commit -m "feat: add the privacy policy page"`

### Task 3: E2E facts and page lists

**Model / effort:** Sonnet, high

**Files:**

- Create: `e2e/privacy.spec.ts`
- Modify: `e2e/noindex.spec.ts` (both path lists), `e2e/pages.ts`, `e2e/demo-banner.spec.ts` (`paths`), `e2e/content.spec.ts` (footer path list)

**Interfaces:**

- Consumes: `PRIVACY_PATH`, `INQUIRY_PRIVACY_HREF` (Task 1); the page (Task 2); the existing `fillValid` pattern from `e2e/inquiry.spec.ts` (copy the four field fills and the checkbox; do not import across specs).

- [ ] **Step 1: Write the tests** (`e2e/privacy.spec.ts`)
  - `"public pages and the inquiry submit set no cookie (5b SC-3)"`: visit `/`, `/produkte/moebelteile/testkeil-mit-daempfung`, `/datenschutz`; then `/anfrage?bestellnummer=99010%20-%201`, fill valid, click "Anfrage prüfen", wait for `getByRole("status")` containing "nicht versendet"; `expect(await context.cookies()).toEqual([])`.
  - `"no-JS inquiry submit sets no cookie (5b SC-3)"`: new context with `javaScriptEnabled: false`, same submit, same assertion.
  - `"login page alone sets no cookie (Review Focus 1)"`: visit `/admin/login`, then `/`; cookies `[]`.
  - `"home and product page request only the app origin (5b SC-4)"`: collect `page.on("request")` URLs while loading `/` and the product page (`waitUntil: "networkidle"`); every `new URL(url).origin` equals `new URL(baseURL).origin` (ignore `data:` and `blob:`).
  - `"form privacy link opens the inquiry section (Review Focus 2)"`: on `/anfrage`, click link "Datenschutzhinweise"; URL ends with `INQUIRY_PRIVACY_HREF`; heading "Anfrageformular" is in the viewport.
  - Lists: add `"/datenschutz"` to both lists in `e2e/noindex.spec.ts`, to `PAGES` in `e2e/pages.ts`, to `paths` in `e2e/demo-banner.spec.ts`, and to the footer test's path list in `e2e/content.spec.ts`.

- [ ] **Step 2: Prepare the stack and build** (CLAUDE.md, "E2E")

  `pnpm db:start && pnpm db:reset`; read `API_URL` and `ANON_KEY` from `pnpm exec supabase status -o json`; check that the E2E port is free (`lsof -iTCP:3000 -sTCP:LISTEN`; else set `E2E_PORT`); build with `NEXT_PUBLIC_SUPABASE_URL=<API_URL> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> NEXT_PUBLIC_SITE_URL=http://localhost:3000 pnpm build`.

- [ ] **Step 3: Run the new and changed specs**

  Run: `pnpm e2e e2e/privacy.spec.ts e2e/noindex.spec.ts e2e/demo-banner.spec.ts e2e/content.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts`
  Expected: all pass. If SC-4 fails because of a request to another origin, report it (it contradicts the policy) instead of widening the allow-list.

- [ ] **Step 4: Run the full E2E suite**

  Run: `pnpm e2e`
  Expected: exit 0.

- [ ] **Step 5: Commit**

  `git add e2e/privacy.spec.ts e2e/noindex.spec.ts e2e/pages.ts e2e/demo-banner.spec.ts e2e/content.spec.ts`
  `git commit -m "test: pin the privacy policy facts in E2E"`

### Task 4: Docs

**Model / effort:** Haiku, low

**Files:**

- Add: `docs/specs/2026-11-09-privacy-policy-design.md`, `docs/plans/2026-11-09-privacy-policy.md` (copy from the main checkout, same relative paths)
- Modify: `docs/roadmap.md`, `docs/specs/2026-10-09-content-inquiry-design.md`, `docs/deploy.md`

- [ ] **Step 1: Copy spec and plan** from the main checkout into the worktree (same relative paths).
- [ ] **Step 2: `docs/roadmap.md`**: in the "Inquiry" decision row replace "imprint and privacy are links to the operator's pages" with "imprint is a link to the operator's page; the privacy policy is a page of its own (5b)"; add a feature row after 5: `| 5b  | **Privacy policy page** — own German privacy policy at `/datenschutz`, linked from footer and inquiry form, facts pinned by tests; precondition for switching basic auth off — [spec](specs/2026-11-09-privacy-policy-design.md) | in progress | 4 h  |` (table formatting by Prettier).
- [ ] **Step 3: `docs/specs/2026-10-09-content-inquiry-design.md`**: under "### D1", add one line: "Superseded for the privacy policy by feature 5b ([spec](2026-11-09-privacy-policy-design.md)); the imprint stays a link."
- [ ] **Step 4: `docs/deploy.md`** section 6, basic-auth bullet: "To make the preview public" becomes "Once the privacy policy page (feature 5b) is live, the preview may go public: switch the authentication off, redeploy and delete the secret."
- [ ] **Step 5: Verify** `pnpm exec prettier --check docs` → exit 0.
- [ ] **Step 6: Commit**

  `git add docs/specs/2026-11-09-privacy-policy-design.md docs/plans/2026-11-09-privacy-policy.md docs/roadmap.md docs/specs/2026-10-09-content-inquiry-design.md docs/deploy.md`
  `git commit -m "docs: add the privacy policy spec and plan, update roadmap and runbook"`

### Task 5: Independent review of the text and check report (spec D7)

**Run by the orchestrating session, not by an implementer.** Reviewers get absolute paths and change nothing.

- [ ] **Step 1: Build-output search** (template step 5a): after the Task 3 build, `grep -rlE "localStorage|sessionStorage|document.cookie|indexedDB" .next/static` in the worktree; record hits with the module they come from ("look", not "stores").
- [ ] **Step 2: Three reviewers in parallel** (read `app/(site)/datenschutz/page.tsx`, the spec, the code; facts reviewer also gets the developer's private handover note (server state section) and the latest server check script output as server evidence):
  - Legal (Opus, high): Art. 13 GDPR completeness per processing (purpose, data, legal basis with interest, recipients, retention, necessity, third country), § 25 TDDDG, wording that implies consent.
  - Facts (Sonnet, high): every sentence → evidence class (spec D7) with file:line or note section; mismatches are blockers.
  - Language (Sonnet, medium): plain German, the `vermenschlichen` rules, consistency with the template.
- [ ] **Step 3: Apply findings** within the authority of spec D7 (wording, clear factual or citation errors); anything of substance goes unchanged to the Gate 2 report. Re-run `pnpm test "app/(site)/datenschutz"` after text edits; commit `fix: refine the privacy policy text after review`.
- [ ] **Step 4: Final pass** (Sonnet, high): checks that every finding is resolved or listed, and that the page still matches the tests.
- [ ] **Step 5: Check report** to the main checkout's private `.claude/notes/` (German): table "Satz → Beleg" with evidence class, build-output search result, findings per reviewer with resolution, open items with reason, and the go-live checklist from spec D9.

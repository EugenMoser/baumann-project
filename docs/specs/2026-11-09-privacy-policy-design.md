# Feature 5b — Privacy policy page

- **Status:** draft (2026-11-09), approved with the start of `/goal`
- **Roadmap:** feature 5b ([roadmap](../roadmap.md))
- **Estimate:** 4 h
- **Builds on:** feature 5 ([spec](2026-10-09-content-inquiry-design.md);
  this spec replaces its D1 for the privacy policy) and the data minimisation
  of the Supabase stack (`docs/deploy.md` section 3, PR #18)

## Goal

The preview sits behind basic auth because it has no privacy policy of its
own: the footer and the inquiry form link to the developer's policy on
`eugen-moser.com`, which does not describe this app. After this feature the
preview has its own German privacy policy at `/datenschutz` that describes
exactly what this app processes, in as few sentences as Art. 13 GDPR allows.
Every sentence is backed by code, configuration or a server check. With the
policy deployed and checked live, the developer can switch basic auth off and
show the preview publicly (the customer's written consent exists).

The text follows the developer's privacy template for all sites on the shared
server (a private note, not in the repo). Appendix A holds the draft text.

## Background: what exists today

| Area             | Today (evidence)                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal links      | `config/branding.ts` `developer.imprintUrl` / `privacyUrl` point to `eugen-moser.com`; rendered in `components/site/site-footer.tsx` and in the inquiry consent label (`components/inquiry/inquiry-form.tsx`). No `/datenschutz` route exists.     |
| Cookies, storage | Public pages set no cookie (`lib/supabase/server.ts`, `persistSession: false`; E2E `e2e/admin/auth.spec.ts` checks `/` and a product page). Only `/admin` writes the `@supabase/ssr` session cookie. No `localStorage`, theme switch or analytics. |
| Third parties    | None in the browser: fonts via `next/font` (build time), images via `/_next/image` on the app host, certificate PDFs linked on the API host of the same server. Outbound links only (official site, `eugen-moser.com`).                            |
| Inquiry form     | Validates and discards (`NoopInquirySender`); only the order number reaches the database (`find_variant`); no storage, mail, logging of values or rate limit.                                                                                      |
| Admin            | Developer only, sign-up off. AI assistant sends public catalog data to OpenRouter/Anthropic, no visitor data.                                                                                                                                      |
| Server           | Shared Hostinger VPS (Frankfurt). No access logs (Traefik, Kong); Supabase services log errors only; no log collection.                                                                                                                            |
| Contact data     | The repo holds no postal address and no contact e-mail.                                                                                                                                                                                            |

## Scope

In scope:

- Page `/datenschutz` with the German text (D1–D3, Appendix A)
- Footer and inquiry form link to it (D4, D5)
- Tests that pin the facts the text states (D6)
- Review of the text by independent agents and a written check report (D7)
- Roadmap row and the two docs that describe the legal links (D8)

Out of scope:

- An imprint page in the app; the imprint stays a link to `eugen-moser.com`
- Any change to what the inquiry form does (it keeps validating and
  discarding)
- A cookie banner (no consent-requiring storage exists)
- Mentioning the AI providers: they receive no personal data
- An English version
- Switching basic auth off; that happens after merge and live checks (D9)
- The README demo link (feature 8 owns the README)

Anti-goals (a failure even if everything renders):

- A sentence that is not true for this app, or a hard promise that a later
  change could silently break without a failing test
- Wording that presents the form checkbox as consent
- The developer's postal address in the repository
- The customer's company name in the policy text

## Decisions

### D1 — Own page in the app

`app/(site)/datenschutz/page.tsx`, a static Server Component in the `(site)`
layout (demo banner, header, footer), following the quality page's structure
(`PageHeader`, prose width). Metadata: title "Datenschutz", a one-line
description. `noindex` comes from the root layout and `X-Robots-Tag` as for
every page. Section anchors: `#anfrageformular` on the inquiry section (the
form links there).

### D2 — Controller: name and e-mail, address via the imprint

The repo is public. The controller block names "Eugen Moser" and
`info@eugen-moser.com` and links to the imprint on `eugen-moser.com` for the
postal address. A sentence states that the developer, not the company whose
catalog the preview shows, is responsible.

### D3 — Text from the template, static in the page

The text is static German JSX, taken from Appendix A. The sentence on server
error logs is the template's uniform sentence, verbatim. The text names no
customer and does not depend on the active branding, so the placeholder
branding renders the same page. "Stand: November 2026" at the end.

The sentence "nicht die Firma, deren Produktkatalog die Vorschau zeigt" stays
true with the placeholder branding (a fictional company is not responsible
either), so no conditional text (builder's call, made in the spec). The
handover snapshot (`docs/deploy.md` section 10) holds catalog data and the
developer's own admin account, no visitor data; the policy does not mention
it.

### D4 — Inquiry form keeps its checkbox

The required checkbox "Ich habe die Datenschutzhinweise gelesen." stays (the
developer's decision). Its link points to `/datenschutz#anfrageformular`. The
policy lists the checkbox among the required inputs and never calls it
consent.

### D5 — Branding and links

`developer.privacyUrl` goes away from the branding schema and both brandings;
the footer and the form use one internal path constant (`/datenschutz`, as a
Next.js `Link`). `developer.imprintUrl` stays external. The contact e-mail is
added to the developer block of the branding (`developer.email`, same value in
both brandings) and used by the page. Exact names are the builder's call.

### D6 — Facts pinned by tests

The text makes claims a later change could break. Tests pin them (SC-3 to
SC-6): no cookie on public pages including the inquiry submit, no request to a
third-party host, the form's required fields as listed, and the e-mail address
shown. The build output is searched for browser storage APIs once, by hand,
for the check report (template step 5a); a hit means "look", not "stores".

### D7 — Independent review and check report

Before Gate 2 three independent agents read the page: legal (Art. 13 GDPR,
completeness and legal bases), facts (every sentence against code,
configuration and `docs/deploy.md`), language (plain German, no AI patterns).
A final pass checks that their findings are resolved. The check report goes
to `.claude/notes/` (private) with a table "sentence → evidence" and lists open
findings with a reason.

Evidence classes in the table:

- **Code / config / test** — file and line in this repo.
- **Stack** — `docs/deploy.md` section 3 (Supabase logs, services), verified
  on the server on 2026-11-09.
- **Server** — the shared server's state (no Traefik access log, volatile
  journal, the 30-day sentence, Hostinger, Frankfurt, backups) comes from the
  developer's private handover note, section 4, with the check script run of
  2026-11-06. The run's path is given to the agents as an absolute path. The
  facts agent accepts this as evidence and marks such sentences "server";
  they are not blockers unless the note contradicts the sentence.
- **External** — Hostinger's DPA and the adequacy/SCC statements: taken from
  the template unchanged; the legal agent checks them, the facts agent does
  not.

Builder's authority over findings (builder's call, made in the spec): the
build fixes in place what is clearly wrong or unclear without changing what
the policy says the app does: a statement that contradicts the code, a wrong
article citation, wording and style. It does not change on its own: adding
or removing a processing activity, a legal basis, a retention period, or any
of D1–D5. Such findings stay unchanged in the text and go to the Gate 2
report with the reviewer's proposal.

### D8 — Docs

- `docs/roadmap.md`: row 5b; the decision line for the content pages says the
  privacy policy is a page of its own.
- `docs/specs/2026-10-09-content-inquiry-design.md` D1: one line noting that
  this spec replaces it for the privacy policy.
- `docs/deploy.md`: where it describes basic auth, a note that the preview may
  run without basic auth once 5b is live.

### D9 — Go-live after merge (not part of the build)

After Gate 2, merge and deploy: the developer opens the live page; `curl -sI`
on `/`, a product page and `/datenschutz` shows no `Set-Cookie`; the browser's
network view on the home page and a product page shows only own hosts; the
developer runs the server check script. Then the developer switches basic
auth off in Coolify and deletes the `PREVIEW_BASIC_AUTH` secret; the next CI
smoke check runs without credentials.

## Requirements

- **FR-1** `/datenschutz` renders the text of Appendix A with the section
  headings in that order; the Art. 21 section is visually stronger than body
  text (full text colour instead of muted).
- **FR-2** The controller block shows the name, the e-mail as `mailto:` link
  and a link to the imprint on `eugen-moser.com`.
- **FR-3** The footer's "Datenschutz" link points to `/datenschutz` on every
  `(site)` page; "Impressum" still points to the external imprint.
- **FR-4** The inquiry form's checkbox label links to
  `/datenschutz#anfrageformular`; the checkbox stays required.
- **FR-5** The page has its own metadata title and description and inherits
  `noindex`.
- **FR-6** The page renders identically with the customer and the placeholder
  branding (no customer name in the text).
- **FR-7** `docs/roadmap.md`, the feature 5 spec and `docs/deploy.md` are
  updated as in D8.

## Success criteria

- **SC-1** Unit test: the page renders every heading of Appendix A, the
  verbatim server-log sentence, the e-mail link and the imprint link.
- **SC-2** Unit tests: footer and inquiry form link to the internal path
  (FR-3, FR-4); the branding schema test no longer expects `privacyUrl`.
- **SC-3** E2E: `/`, a product page, `/datenschutz` and the inquiry page after
  a valid submit set no cookie (extends the existing `sb-*` check to any
  cookie).
- **SC-4** E2E: loading the home page and a product page (no clicks) requests
  only the app's own origin; images come through `/_next/image`. Certificate
  PDFs on the API host are links, loaded only on click, and are outside this
  check. In D9 "own hosts" means the app host and the API host, both on the
  same server.
- **SC-5** Unit test: the inquiry schema's required fields are exactly the
  ones the policy lists (name, e-mail, order number or message, checkbox).
- **SC-6** `/datenschutz` is in the shared E2E page lists: `noindex` meta and
  header, a11y, 360 px layout, demo banner.
- **SC-7** The check report exists with the sentence → evidence table and the
  result of the build-output search; the three reviews and the final pass
  report no open blocker, or open items are listed with a reason.
- **SC-8** `pnpm typecheck`, `lint`, `test`, `build` and `e2e` exit 0.

## Appendix A — Draft text (German)

Headings are `h2` unless noted. Reviews (D7) may change wording; changes of
substance go to Gate 2.

**Datenschutzerklärung** (page title)

**Verantwortlicher**

Eugen Moser
E-Mail: info@eugen-moser.com
Meine Anschrift steht im [Impressum](https://eugen-moser.com/impressum).

Diese Website ist eine Vorschau, die ich als Entwickler betreibe.
Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website
bin ich, nicht die Firma, deren Produktkatalog die Vorschau zeigt.

**Überblick**

Die öffentlichen Seiten setzen keine Cookies und nutzen keinen lokalen
Browserspeicher und keine Tracking- oder Analyse-Dienste. Personenbezogene
Daten verarbeite ich, wenn Sie die Website aufrufen oder das Anfrageformular
ausprobieren.

Sie können die öffentlichen Seiten ohne Anmeldung nutzen. Das Anfrageformular
versendet nichts; Sie können es auch mit erfundenen Angaben ausprobieren.

**Hosting**

Die Website läuft auf einem Server der Hostinger International Ltd., 61 Lordou
Vironos str., 6023 Larnaca, Zypern. Der Server steht in Frankfurt am Main.
Auch die Datenbank der Website und die Zertifikate als PDF liegen dort, ebenso
meine E-Mails. Hostinger verarbeitet die Daten, die beim Aufruf der Website und
bei E-Mails an mich anfallen, in meinem Auftrag. Mit Hostinger besteht ein
Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.

Hostinger setzt weitere Dienstleister ein, auch in den USA und Kanada. Die
Liste steht im Vertrag zur Auftragsverarbeitung
(https://www.hostinger.com/legal/dpa). Für Kanada besteht ein
Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO), für die USA nur bei
Unternehmen, die nach dem EU-US Data Privacy Framework zertifiziert sind. Im
Übrigen sieht der Vertrag die EU-Standardvertragsklauseln vor (Art. 46 Abs. 2
lit. c DSGVO, https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj).

**Aufruf der Website**

Wenn Sie die Website aufrufen, verarbeitet der Server Ihre IP-Adresse und
technische Verbindungsdaten, um Ihnen die Seite auszuliefern. Ohne IP-Adresse
kann die Seite nicht ausgeliefert werden. Ich führe kein Zugriffsprotokoll.
Fehlermeldungen des Servers können Ihre IP-Adresse enthalten. Sie werden
spätestens nach 30 Tagen gelöscht, auch in den Sicherungen. Rechtsgrundlage
ist Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse liegt in der
sicheren und fehlerfreien Bereitstellung der Website.

**Anfrageformular** (`id="anfrageformular"`)

Das Anfrageformular gehört zur Vorschau und versendet nichts. Wenn Sie es
absenden, prüft der Server Ihre Angaben (Name, E-Mail-Adresse und je nach
Eingabe Firma, Telefonnummer, Bestellnummer, Menge und Nachricht) auf
Vollständigkeit und Format und sucht die Bestellnummer im Produktkatalog.
Danach verwirft er die Angaben. Das Formular speichert sie nicht und schickt
sie weder an mich noch an die Firma, deren Katalog die Vorschau zeigt.

Ihre Angaben sind freiwillig. Das Formular lässt sich aber nur mit Name,
E-Mail-Adresse, Bestellnummer oder Nachricht und dem Häkchen bei den
Datenschutzhinweisen absenden; Firma, Telefonnummer und Menge sind optional.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse
liegt darin, die Funktion des Formulars vorzuführen.

**Admin-Bereich**

Der Admin-Bereich ist nur für mich; eine Registrierung gibt es nicht. Wer sich
dort anmeldet, schickt E-Mail-Adresse und Passwort an den Anmeldedienst auf
demselben Server. Nach der Anmeldung setzt die Website ein Cookie, das die
Anmeldung hält. Es ist dafür technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG)
und wird beim Abmelden gelöscht, spätestens nach 400 Tagen. Rechtsgrundlage
ist Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse liegt darin, den
Admin-Bereich vor fremdem Zugriff zu schützen.

**Ihre Rechte**

Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
Verarbeitung und Datenübertragbarkeit (Art. 15 bis 18 und 20 DSGVO). Eine
formlose Nachricht an info@eugen-moser.com genügt.

**Widerspruchsrecht (Art. 21 DSGVO)** (emphasised, FR-1)

Soweit ich Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeite,
können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
jederzeit widersprechen. Ich verarbeite die Daten dann nicht mehr, es sei
denn, ich kann zwingende schutzwürdige Gründe nachweisen, die Ihre Interessen,
Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der
Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Auch hier
genügt eine formlose E-Mail an info@eugen-moser.com.

**Beschwerderecht**

Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77
DSGVO). Für mich zuständig ist der Landesbeauftragte für den Datenschutz und
die Informationsfreiheit Baden-Württemberg.

Stand: November 2026

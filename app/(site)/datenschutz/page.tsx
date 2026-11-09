import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { branding } from "@/config/branding";
import { INQUIRY_PRIVACY_ANCHOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Datenschutz",
  description:
    "Welche Daten diese Vorschau verarbeitet und welche Rechte Sie haben.",
};

const linkClass = "underline underline-offset-2";
const headingClass = "text-xl font-semibold tracking-tight";
const sectionClass = "flex flex-col gap-4";

function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} className={`${linkClass} break-all`}>
      {href}
    </a>
  );
}

export default function PrivacyPage() {
  const { developer } = branding;
  const mail = (
    <a href={`mailto:${developer.email}`} className={linkClass}>
      {developer.email}
    </a>
  );
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
      <PageHeader eyebrow="Rechtliches" title="Datenschutzerklärung" />

      <section aria-labelledby="verantwortlicher" className={sectionClass}>
        <h2 id="verantwortlicher" className={headingClass}>
          Verantwortlicher
        </h2>
        <p className="max-w-prose">
          {developer.name}
          <br />
          E-Mail: {mail}
          <br />
          Meine Anschrift steht im{" "}
          <a href={developer.imprintUrl} className={linkClass}>
            Impressum
          </a>
          .
        </p>
        <p className="max-w-prose">
          Diese Website ist eine Vorschau, die ich als Entwickler betreibe.
          Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser
          Website bin ich, nicht die Firma, deren Produktkatalog die Vorschau
          zeigt.
        </p>
      </section>

      <section aria-labelledby="ueberblick" className={sectionClass}>
        <h2 id="ueberblick" className={headingClass}>
          Überblick
        </h2>
        <p className="max-w-prose">
          Die öffentlichen Seiten setzen keine Cookies, nutzen keinen lokalen
          Browserspeicher und keine Tracking- oder Analyse-Dienste.
          Personenbezogene Daten verarbeite ich, wenn Sie die Website aufrufen
          oder das Anfrageformular ausprobieren.
        </p>
        <p className="max-w-prose">
          Sie können die öffentlichen Seiten ohne Anmeldung nutzen. Das
          Anfrageformular können Sie auch mit erfundenen Angaben ausprobieren.
        </p>
      </section>

      <section aria-labelledby="hosting" className={sectionClass}>
        <h2 id="hosting" className={headingClass}>
          Hosting
        </h2>
        <p className="max-w-prose">
          Die Website läuft auf einem Server der Hostinger International Ltd.,
          61 Lordou Vironos str., 6023 Larnaca, Zypern. Der Server steht in
          Frankfurt am Main. Dort liegen auch die Datenbank der Website und die
          PDF-Dateien der Qualitätszertifikate. Auch meine E-Mails liegen bei
          Hostinger. Hostinger verarbeitet die Daten, die beim Aufruf und bei
          der Nutzung der Website und bei E-Mails an mich anfallen, in meinem
          Auftrag. Mit Hostinger besteht ein Vertrag zur Auftragsverarbeitung
          nach Art. 28 DSGVO.
        </p>
        <p className="max-w-prose">
          Hostinger setzt weitere Dienstleister ein, auch in den USA und Kanada.
          Die Liste steht im Vertrag zur Auftragsverarbeitung (
          <ExternalLink href="https://www.hostinger.com/legal/dpa" />
          ). Für Kanada besteht ein Angemessenheitsbeschluss der EU-Kommission
          (Art. 45 DSGVO), für die USA nur bei Unternehmen, die nach dem EU-US
          Data Privacy Framework zertifiziert sind. Im Übrigen sieht der Vertrag
          die EU-Standardvertragsklauseln vor (Art. 46 Abs. 2 lit. c DSGVO,{" "}
          <ExternalLink href="https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj" />
          ).
        </p>
      </section>

      <section aria-labelledby="aufruf" className={sectionClass}>
        <h2 id="aufruf" className={headingClass}>
          Aufruf der Website
        </h2>
        <p className="max-w-prose">
          Wenn Sie die Website aufrufen, verarbeitet der Server Ihre IP-Adresse
          und technische Verbindungsdaten, um Ihnen die Seite auszuliefern. Ohne
          IP-Adresse kann die Seite nicht ausgeliefert werden. Ich führe kein
          Zugriffsprotokoll. Fehlermeldungen des Servers können Ihre IP-Adresse
          enthalten. Sie werden spätestens nach 30 Tagen gelöscht, auch in den
          Sicherungen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Mein
          berechtigtes Interesse liegt in der sicheren und fehlerfreien
          Bereitstellung der Website.
        </p>
      </section>

      <section
        id={INQUIRY_PRIVACY_ANCHOR}
        aria-labelledby="anfrageformular-heading"
        className={`${sectionClass} scroll-mt-24`}
      >
        <h2 id="anfrageformular-heading" className={headingClass}>
          Anfrageformular
        </h2>
        <p className="max-w-prose">
          Das Anfrageformular gehört zur Vorschau. Wenn Sie es absenden, prüft
          der Server Ihre Angaben auf Vollständigkeit und Format und sucht die
          Bestellnummer im Produktkatalog. Verarbeitet werden Name und
          E-Mail-Adresse, je nach Eingabe auch Firma, Telefonnummer,
          Bestellnummer, Menge und Nachricht. Danach verwirft der Server die
          Angaben. Eine Anfrage an mich oder an die Firma, deren Katalog die
          Vorschau zeigt, entsteht dabei nicht.
        </p>
        <p className="max-w-prose">
          Ihre Angaben sind freiwillig. Das Formular lässt sich aber nur
          absenden, wenn Name, E-Mail-Adresse und entweder Bestellnummer oder
          Nachricht ausgefüllt sind und das Häkchen bei „Ich habe die
          Datenschutzhinweise gelesen.“ gesetzt ist. Firma, Telefonnummer und
          Menge sind optional.
        </p>
        <p className="max-w-prose">
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes
          Interesse liegt darin, Ihnen und anderen Interessenten zu zeigen, wie
          das Formular funktioniert.
        </p>
      </section>

      <section aria-labelledby="admin" className={sectionClass}>
        <h2 id="admin" className={headingClass}>
          Admin-Bereich
        </h2>
        <p className="max-w-prose">
          Der Admin-Bereich ist nur für mich; eine Registrierung gibt es nicht.
          Wer sich dort anmeldet, schickt E-Mail-Adresse und Passwort über die
          Website an den Anmeldedienst auf demselben Server. Nach der Anmeldung
          setzt die Website Cookies, damit die Anmeldung bestehen bleibt. Sie
          sind dafür technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Beim
          Abmelden werden sie gelöscht, sonst laufen sie spätestens 400 Tage
          nach dem letzten Besuch im Admin-Bereich ab. Rechtsgrundlage ist Art.
          6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse liegt darin, den
          Katalog pflegen zu können und den Admin-Bereich vor fremdem Zugriff zu
          schützen.
        </p>
      </section>

      <section aria-labelledby="rechte" className={sectionClass}>
        <h2 id="rechte" className={headingClass}>
          Ihre Rechte
        </h2>
        <p className="max-w-prose">
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis
          18 und 20 DSGVO). Eine formlose Nachricht an {mail} genügt.
        </p>
      </section>

      <section
        aria-labelledby="widerspruch"
        className={`${sectionClass} border-l-4 border-ink pl-4`}
      >
        <h2 id="widerspruch" className={headingClass}>
          Widerspruchsrecht (Art. 21 DSGVO)
        </h2>
        <p className="max-w-prose font-medium">
          Soweit ich Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO
          verarbeite, können Sie aus Gründen, die sich aus Ihrer besonderen
          Situation ergeben, jederzeit widersprechen. Ich verarbeite die Daten
          dann nicht mehr, es sei denn, ich kann zwingende schutzwürdige Gründe
          nachweisen, die Ihre Interessen, Rechte und Freiheiten überwiegen,
          oder die Verarbeitung dient der Geltendmachung, Ausübung oder
          Verteidigung von Rechtsansprüchen. Auch hier genügt eine formlose
          E-Mail an {mail}.
        </p>
      </section>

      <section aria-labelledby="beschwerde" className={sectionClass}>
        <h2 id="beschwerde" className={headingClass}>
          Beschwerderecht
        </h2>
        <p className="max-w-prose">
          Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren
          (Art. 77 DSGVO). Für mich zuständig ist der Landesbeauftragte für den
          Datenschutz und die Informationsfreiheit Baden-Württemberg.
        </p>
      </section>

      <p className="max-w-prose text-sm">Stand: November 2026</p>
    </main>
  );
}

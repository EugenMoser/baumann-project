export function InquiryDemoNotice({
  officialSiteUrl,
}: {
  officialSiteUrl: string;
}) {
  return (
    <aside
      aria-label="Hinweis zum Formular"
      className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p>
        <span className="font-semibold">Vorschau:</span> Anfragen über dieses
        Formular werden geprüft, aber nicht versendet. Für echte Anfragen nutzen
        Sie bitte die{" "}
        <a href={officialSiteUrl} className="underline underline-offset-2">
          offizielle Website
        </a>
        .
      </p>
    </aside>
  );
}

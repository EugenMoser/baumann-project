// D8: descriptions are plain text; blank lines separate paragraphs.
export function toParagraphs(text: string | null): string[][] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0);
}

export function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}

// First sentence of a text, shortened to `max` characters at a word boundary.
export function firstSentence(text: string | null, max = 80): string | null {
  const clean = text?.trim();
  if (!clean) return null;
  const sentence = clean.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? clean;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

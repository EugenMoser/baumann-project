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

// German abbreviations whose dot does not end a sentence. The first parts of
// "z. B.", "u. a." and "d. h." are covered by looking at the following text.
const ABBREVIATION =
  /(?:^|\s)(?:z\. ?B|u\. ?a|d\. ?h|ca|bzw|nr|usw|inkl|ggf|evtl)\.$/i;
const ABBREVIATION_START = /(?:^|\s)[zud]\.$/i;
const ABBREVIATION_REST = /^ ?[Bah]\./;

function endsSentence(text: string, dot: number): boolean {
  const rest = text.slice(dot + 1);
  if (rest === "" || /^\s*$/.test(rest)) return true;
  if (!/^\s+\p{Lu}/u.test(rest)) return false;
  const before = text.slice(0, dot + 1);
  if (ABBREVIATION.test(before)) return false;
  return !(
    ABBREVIATION_START.test(before) && ABBREVIATION_REST.test(rest.trimStart())
  );
}

// First sentence of a text, shortened to `max` characters at a word boundary.
export function firstSentence(text: string | null, max = 80): string | null {
  const clean = text?.trim();
  if (!clean) return null;
  let sentence = clean;
  for (const match of clean.matchAll(/[.!?]/g)) {
    if (endsSentence(clean, match.index)) {
      sentence = clean.slice(0, match.index + 1);
      break;
    }
  }
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut.slice(0, max)).trimEnd()}…`;
}

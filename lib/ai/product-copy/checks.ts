import { copySchema, type CopyDraft } from "./schema.ts";

// Deterministic output checks (D3). Pure: no I/O, no provider knowledge.

export type CheckFailure =
  "shape" | "length" | "ending" | "form" | "script" | "numbers";

export type CheckResult =
  | { ok: true; value: CopyDraft }
  | { ok: false; failure: CheckFailure; field?: keyof CopyDraft };

const FIELDS = ["description", "seoTitle", "seoDescription"] as const;

// Maxima are exclusive: a value exactly at the limit is a sign of a cut-off.
const DESCRIPTION_MIN = 80;
const DESCRIPTION_MAX = 700;
const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MAX = 155;

// Thousands separator: a dot between digit groups ("1.000", "12.500").
const THOUSANDS = /\b[1-9]\d{0,2}(?:\.\d{3})+(?!\d)/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

// The single normalisation for both sides of the number check: decimal comma
// kept (a decimal dot becomes a comma), thousands separators removed.
export function numbersIn(text: string): string[] {
  const withoutThousands = text.replace(THOUSANDS, (match) =>
    match.replaceAll(".", "")
  );
  return (withoutThousands.match(NUMBER) ?? []).map((n) => n.replace(".", ","));
}

const SENTENCE_END = /[.!?]$/;
const TITLE_CUT = /[-,:–]$/;

// List items, headings, Markdown emphasis and links.
const LINE_MARKER = /^\s*(?:[-*•#]|\d+\.(?!\d))/m;
const MARKDOWN_INLINE = /\*\*|__|\[[^\]]*\]\(/;

// Latin letters incl. umlauts and ß, digits, whitespace, ASCII punctuation and
// the listed typographic symbols.
const ALLOWED_CHARS = /^[\p{Script=Latin}0-9\s!-/:-@[-`{-~–„“‚‘×°±⌀]*$/u;

function lengthOk(draft: CopyDraft): keyof CopyDraft | null {
  const { description, seoTitle, seoDescription } = draft;
  if (
    description.length < DESCRIPTION_MIN ||
    description.length >= DESCRIPTION_MAX
  )
    return "description";
  if (seoTitle.length >= SEO_TITLE_MAX) return "seoTitle";
  if (seoDescription.length >= SEO_DESCRIPTION_MAX) return "seoDescription";
  return null;
}

export function checkCopy(
  raw: unknown,
  inputNumbers: ReadonlySet<string>
): CheckResult {
  const parsed = copySchema.safeParse(raw);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    const field = FIELDS.find((name) => name === key);
    return field
      ? { ok: false, failure: "shape", field }
      : { ok: false, failure: "shape" };
  }
  const draft = parsed.data;

  const tooLong = lengthOk(draft);
  if (tooLong) return { ok: false, failure: "length", field: tooLong };

  if (!SENTENCE_END.test(draft.description))
    return { ok: false, failure: "ending", field: "description" };
  if (TITLE_CUT.test(draft.seoTitle))
    return { ok: false, failure: "ending", field: "seoTitle" };
  if (!SENTENCE_END.test(draft.seoDescription))
    return { ok: false, failure: "ending", field: "seoDescription" };

  if (
    LINE_MARKER.test(draft.description) ||
    MARKDOWN_INLINE.test(draft.description)
  )
    return { ok: false, failure: "form", field: "description" };

  for (const field of FIELDS) {
    if (!ALLOWED_CHARS.test(draft[field]))
      return { ok: false, failure: "script", field };
  }

  for (const field of FIELDS) {
    if (!numbersIn(draft[field]).every((n) => inputNumbers.has(n)))
      return { ok: false, failure: "numbers", field };
  }

  return { ok: true, value: draft };
}

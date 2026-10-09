import type { PayloadAttribute } from "../payload.mts";
import { cleanText, parseDecimal } from "./text.mts";

const mm = (
  key: string,
  label: string,
  sort_order: number
): PayloadAttribute => ({
  key,
  label,
  unit: "mm",
  data_type: "decimal",
  sort_order,
});

// Domain-specific keys on purpose (docs/data-model.md): "Ø" alone has many meanings.
export const ATTRIBUTES: readonly PayloadAttribute[] = [
  mm("height", "Höhe", 10),
  mm("foot_height", "Fußhöhe", 20),
  mm("panel_thickness", "Plattenstärke", 30),
  mm("pipe_diameter", "für Rohr Ø", 40),
  mm("insulated_pipe_diameter", "für isoliertes Rohr Ø", 50),
  mm("round_tube_diameter", "für Rundrohr Ø", 60),
  mm("hose_diameter", "für Schlauch Ø", 70),
  mm("radius", "Radius", 80),
  mm("cable_diameter", "für Kabel Ø", 90),
  mm("strip_width", "Leistenbreite", 100),
  mm("bore_diameter", "Bohrung Ø", 110),
  mm("insertion_depth", "Einschubtiefe", 120),
  mm("pin_diameter", "Zapfen-/Stift-Ø", 130),
];

export type FragmentResult =
  | {
      kind: "typed";
      values: { key: string; value: number }[];
      note: string | null;
      partial: boolean;
    }
  | { kind: "sentence"; text: string }
  | { kind: "unparsed"; text: string };

type Rule = {
  pattern: RegExp;
  keys: readonly string[];
  /** whole: the pattern must cover the fragment; prefix: the rest becomes a note. */
  mode: "whole" | "prefix";
  /** Keeps the full fragment as note (information the keys cannot hold). */
  keepOriginal?: boolean;
};

const N = String.raw`(\d+(?:[.,]\d+)?)`;
const rule = (
  source: string,
  keys: readonly string[],
  mode: Rule["mode"],
  keepOriginal = false
): Rule => {
  const boundary = mode === "prefix" ? String.raw`(?=$|[\s,;(.:-])` : "";
  return {
    pattern: new RegExp(
      mode === "whole" ? `^${source}$` : `^${source}${boundary}`
    ),
    keys,
    mode,
    keepOriginal,
  };
};

// Order matters: specific rules before general ones.
const RULES: readonly Rule[] = [
  rule(
    `für isolierte Abwasserrohre Ø ${N} mm Fußhöhe ${N} mm`,
    ["insulated_pipe_diameter", "foot_height"],
    "whole"
  ),
  rule(
    `für (?:Abwasserrohre|Heizungsrohre) Ø ${N} mm Fußhöhe ${N} mm`,
    ["pipe_diameter", "foot_height"],
    "whole"
  ),
  rule(
    `Höhe ${N} mm und Ø ${N} mm Bohrung`,
    ["height", "bore_diameter"],
    "prefix"
  ),
  rule(`Höhe:? ${N} mm`, ["height"], "prefix"),
  rule(`Fußhöhe ${N} mm`, ["foot_height"], "prefix"),
  rule(`für ${N} mm (?:Plattenstärke|Platte)`, ["panel_thickness"], "prefix"),
  rule(`für Rundrohr Ø ${N} mm`, ["round_tube_diameter"], "whole"),
  rule(
    `für Schlauch Ø ${N} mm R ${N} mm`,
    ["hose_diameter", "radius"],
    "whole"
  ),
  rule(`für Schlauch Ø ${N} mm`, ["hose_diameter"], "whole"),
  rule(`für Kabel Ø ${N} mm`, ["cable_diameter"], "whole"),
  rule(`für Leistenbreite ${N} mm`, ["strip_width"], "prefix"),
  rule(`Tank-Bohrung ${N} mm`, ["bore_diameter"], "whole"),
  rule(`Einschubtiefe:? ${N} mm`, ["insertion_depth"], "whole"),
  rule(`(?:durch )?(?:Stift|Zapfen) Ø ${N} mm`, ["pin_diameter"], "whole"),
  rule(
    `(?:durch )?(?:Stift|Zapfen) Ø ${N} x \\d+(?:[.,]\\d+)? mm`,
    ["pin_diameter"],
    "whole",
    true
  ),
];

/** Types one legacy description field, or says why it could not. Never guesses. */
export function parseFragment(raw: string): FragmentResult {
  const text = cleanText(raw) ?? "";
  for (const r of RULES) {
    const match = r.pattern.exec(text);
    if (match === null) continue;
    const values = r.keys.map((key, index) => ({
      key,
      value: parseDecimal(match[index + 1] ?? ""),
    }));
    if (r.keepOriginal)
      return { kind: "typed", values, note: text, partial: false };
    const remainder = cleanText(
      text.slice(match[0].length).replace(/^[\s,;:-]+/, "")
    );
    return {
      kind: "typed",
      values,
      note: remainder,
      partial: remainder !== null,
    };
  }
  if (text.endsWith(".")) return { kind: "sentence", text };
  return { kind: "unparsed", text };
}

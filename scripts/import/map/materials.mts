import type { PayloadMaterial } from "../payload.mts";
import { cleanText } from "./text.mts";

export const MATERIALS: readonly PayloadMaterial[] = [
  { code: "PA-6", name: "Polyamid 6" },
  { code: "PP", name: "Polypropylen" },
  { code: "ABS", name: "Acrylnitril-Butadien-Styrol" },
  { code: "POM", name: "Polyoxymethylen" },
  { code: "TPE", name: "Thermoplastisches Elastomer" },
  { code: "HMD-PE", name: "Polyethylen (HMD-PE)" },
  { code: "LD-PE", name: "Polyethylen niedriger Dichte" },
  { code: "PC-ABS", name: "Polycarbonat/ABS-Blend" },
  { code: "ASA", name: "Acrylnitril-Styrol-Acrylat" },
  { code: "PBT", name: "Polybutylenterephthalat" },
];

export type MaterialSplit = {
  code: string | null;
  note: string | null;
  fallback: boolean;
};

// Longest first, so "PC-ABS" wins over "ABS".
const CODES = MATERIALS.map((m) => m.code).sort((a, b) => b.length - a.length);

function mentionsCode(text: string, code: string): boolean {
  // Codes contain only [A-Z0-9-], so no escaping is needed.
  return new RegExp(`(^|[^A-Za-z0-9-])${code}([^A-Za-z0-9-]|$)`).test(text);
}

/** Splits legacy material text into a known code and a qualifier; never guesses. */
export function splitMaterial(raw: string | null | undefined): MaterialSplit {
  const text = cleanText(raw);
  if (text === null) return { code: null, note: null, fallback: false };
  const fallback: MaterialSplit = { code: null, note: text, fallback: true };

  const code = CODES.find((c) => text === c || text.startsWith(`${c} `));
  if (code === undefined) return fallback;

  let rest = text.slice(code.length).trim();
  if (rest === "") return { code, note: null, fallback: false };
  const bracketed = /^\((.*)\)$/.exec(rest);
  if (bracketed) rest = bracketed[1].trim();

  const otherCode = CODES.some((c) => c !== code && mentionsCode(rest, c));
  if (rest === "" || /[/:]/.test(rest) || otherCode) return fallback;
  return { code, note: rest, fallback: false };
}

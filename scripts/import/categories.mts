import type { PayloadCategory } from "./payload.mts";

// Legacy category slugs are kept as URL segments (/produkte/moebel). Intro
// texts are written in feature 4; the importer never touches them.
export const CATEGORIES: readonly PayloadCategory[] = [
  { slug: "moebel", name: "Möbel", sort_order: 0 },
  { slug: "halterung", name: "Halterungen", sort_order: 1 },
  { slug: "wasser", name: "Wasser", sort_order: 2 },
  { slug: "lueftung", name: "Lüftungen", sort_order: 3 },
  { slug: "elektro", name: "Elektro", sort_order: 4 },
];

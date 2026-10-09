import type { PayloadCategory } from "./payload.mts";

// Legacy category slugs are kept as URL segments (/produkte/moebel). Intro and
// SEO texts are written editorially; the importer stores them only where the
// database value is empty, so later edits win.
export const CATEGORIES: readonly PayloadCategory[] = [
  {
    slug: "moebel",
    name: "Möbel",
    sort_order: 0,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "halterung",
    name: "Halterungen",
    sort_order: 1,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "wasser",
    name: "Wasser",
    sort_order: 2,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "lueftung",
    name: "Lüftungen",
    sort_order: 3,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
  {
    slug: "elektro",
    name: "Elektro",
    sort_order: 4,
    intro_text: "",
    seo_title: null,
    seo_description: null,
  },
];

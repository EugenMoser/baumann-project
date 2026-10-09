import { truncate } from "./text";
import type { CategoryPage, ProductPage } from "./types";

type PageMeta = { title: string; description: string };

export function productMetadata(page: ProductPage): PageMeta {
  const numbers = page.articles.map((a) => a.articleNumber);
  const list = `${numbers.slice(0, 3).join(", ")}${numbers.length > 3 ? " u. a." : ""}`;
  const colours =
    page.colors.length > 1 ? ` in ${page.colors.length} Farben` : "";
  const lead = page.subtitle ? `${page.name} – ${page.subtitle}` : page.name;
  const sentence = `${lead}. Artikel ${list}${colours}`;
  return {
    title: page.seoTitle ?? page.name,
    description:
      page.seoDescription ??
      truncate(sentence.endsWith(".") ? sentence : `${sentence}.`),
  };
}

export function categoryMetadata(page: CategoryPage): PageMeta {
  return {
    title: page.seoTitle ?? page.name,
    description:
      page.seoDescription ??
      (page.introText.trim()
        ? truncate(page.introText)
        : `${page.name}: alle Produkte im Überblick.`),
  };
}

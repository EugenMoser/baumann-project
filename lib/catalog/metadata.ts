import { truncate } from "./text";
import type { CategoryPage, ProductPage } from "./types";

export type PageMeta = { title: string; description: string };

/** Automatic title and description of a product page (no SEO overrides). */
export function autoProductMeta(input: {
  name: string;
  subtitle: string | null;
  articleNumbers: readonly string[];
  colorCount: number;
}): PageMeta {
  const { name, subtitle, articleNumbers: numbers, colorCount } = input;
  const lead = subtitle ? `${name} – ${subtitle}` : name;
  if (numbers.length === 0) {
    return { title: name, description: lead ? truncate(`${lead}.`) : "" };
  }
  const list = `${numbers.slice(0, 3).join(", ")}${numbers.length > 3 ? " u. a." : ""}`;
  const colours = colorCount > 1 ? ` in ${colorCount} Farben` : "";
  const sentence = `${lead}. Artikel ${list}${colours}`;
  return {
    title: name,
    description: truncate(sentence.endsWith(".") ? sentence : `${sentence}.`),
  };
}

/** Automatic title and description of a category page (no SEO overrides). */
export function autoCategoryMeta(input: {
  name: string;
  introText: string;
}): PageMeta {
  const { name, introText } = input;
  return {
    title: name,
    description: introText.trim()
      ? truncate(introText)
      : `${name}: alle Produkte im Überblick.`,
  };
}

export function productMetadata(page: ProductPage): PageMeta {
  const auto = autoProductMeta({
    name: page.name,
    subtitle: page.subtitle,
    articleNumbers: page.articles.map((a) => a.articleNumber),
    colorCount: page.colors.length,
  });
  return {
    title: page.seoTitle ?? auto.title,
    description: page.seoDescription ?? auto.description,
  };
}

export function categoryMetadata(page: CategoryPage): PageMeta {
  const auto = autoCategoryMeta({
    name: page.name,
    introText: page.introText,
  });
  return {
    title: page.seoTitle ?? auto.title,
    description: page.seoDescription ?? auto.description,
  };
}

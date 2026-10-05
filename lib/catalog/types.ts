import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type ContentOrigin = Enums["content_origin"];
export type MediaRole = Enums["media_role"];

export type CatalogError =
  | { kind: "not_found" }
  | { kind: "db_error"; code: string | null; message: string };

export type CategorySummary = { slug: string; name: string };

export type ProductSummary = {
  slug: string;
  name: string;
  subtitle: string | null;
};

export type CategoryPage = CategorySummary & {
  introText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  products: ProductSummary[];
};

export type Material = { code: string; name: string };

export type ArticleAttributeView = {
  key: string;
  label: string;
  unit: string | null;
  value: number | string;
};

export type ArticleView = {
  articleNumber: string;
  name: string | null;
  description: string | null;
  note: string | null;
  material: Material | null;
  materialNote: string | null;
  attributes: ArticleAttributeView[];
  packaging: { quantity: number; label: string | null }[];
};

export type ColorView = {
  name: string;
  ralReference: string | null;
  hexCode: string;
  family: string;
  suffix: string | null;
  isDefault: boolean;
};

export type VariantView = {
  orderNumber: string;
  articleNumber: string;
  suffix: string | null;
  isDefault: boolean;
};

export type MediaView = {
  storagePath: string;
  width: number;
  height: number;
  altText: string;
  altOrigin: ContentOrigin;
  role: MediaRole;
};

export type AccessoryView = {
  articleNumber: string;
  name: string | null;
  productSlug: string;
  productName: string;
  categorySlug: string;
};

export type ProductPage = ProductSummary & {
  description: string | null;
  descriptionOrigin: ContentOrigin;
  seoTitle: string | null;
  seoDescription: string | null;
  seoOrigin: ContentOrigin;
  category: CategorySummary;
  material: Material | null;
  materialNote: string | null;
  articles: ArticleView[];
  colors: ColorView[];
  variants: VariantView[];
  media: MediaView[];
  accessories: AccessoryView[];
};

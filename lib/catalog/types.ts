import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type ContentOrigin = Enums["content_origin"];
export type MediaRole = Enums["media_role"];

export type CatalogError =
  | { kind: "not_found" }
  | { kind: "db_error"; code: string | null; message: string };

export type ImageRef = {
  storagePath: string;
  width: number;
  height: number;
  altText: string;
};

export type CategorySummary = { slug: string; name: string };

export type RegisterItem = {
  slug: string;
  name: string;
  productCount: number;
  subline: string | null;
  thumbnails: ImageRef[];
};

export type NumberExample = { articleNumber: string; productName: string };

export type CatalogOverview = {
  categories: RegisterItem[];
  productCount: number;
  articleCount: number;
  example: NumberExample | null;
};

export type ProductSummary = {
  slug: string;
  name: string;
  subtitle: string | null;
  thumbnail: ImageRef | null;
  tileImage: ImageRef | null;
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
  sortOrder: number;
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
  id: number;
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
  colorId: number | null;
};

export type MediaView = ImageRef & {
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
  related: ProductSummary[];
};

export type MatchKind = "exact_number" | "number" | "text";

export type SearchHit = {
  categorySlug: string;
  productSlug: string;
  name: string;
  subtitle: string | null;
  matchedNumbers: string[];
  matchKind: MatchKind;
};

export type SearchResult = SearchHit & { thumbnail: ImageRef | null };

export type CertificateLanguage = "de" | "en";

export type CertificateView = {
  standard: string;
  title: string;
  preview: ImageRef;
  documents: { language: CertificateLanguage; storagePath: string }[];
};

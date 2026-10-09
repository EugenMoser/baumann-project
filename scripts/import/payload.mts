// Flat JSON payload for public.import_catalog(jsonb). Every array maps to one
// jsonb_to_recordset() call in the migration; field names are column names.
export type PayloadCategory = {
  slug: string;
  name: string;
  sort_order: number;
};
export type PayloadMaterial = { code: string; name: string };
export type PayloadAttribute = {
  key: string;
  label: string;
  unit: string | null;
  data_type: "decimal" | "text";
  sort_order: number;
};
export type PayloadCategoryAttribute = {
  category_slug: string;
  attribute_key: string;
  sort_order: number;
};
export type PayloadColor = {
  name: string;
  ral_reference: string | null;
  hex_code: string;
  family: string;
};
export type PayloadMedia = {
  storage_path: string;
  width: number;
  height: number;
  alt_text: string;
};
export type PayloadProduct = {
  legacy_product_id: number;
  category_slug: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  material_code: string | null;
  material_note: string | null;
  sort_order: number;
};
export type PayloadArticle = {
  article_number: string;
  legacy_product_id: number;
  name: string | null;
  description: string | null;
  note: string | null;
  sort_order: number;
};
export type PayloadArticleAttribute = {
  article_number: string;
  key: string;
  value_decimal: number | null;
  value_text: string | null;
};
export type PayloadArticlePackaging = {
  article_number: string;
  quantity: number;
  sort_order: number;
};
export type PayloadProductColor = {
  legacy_product_id: number;
  color_name: string;
  color_hex: string;
  suffix: string | null;
  is_default: boolean;
  sort_order: number;
};
export type PayloadProductMedia = {
  legacy_product_id: number;
  storage_path: string;
  role: "thumbnail" | "gallery";
  sort_order: number;
};
export type PayloadProductAccessory = {
  legacy_product_id: number;
  article_number: string;
  sort_order: number;
};

export type ImportPayload = {
  categories: PayloadCategory[];
  materials: PayloadMaterial[];
  attributes: PayloadAttribute[];
  category_attributes: PayloadCategoryAttribute[];
  colors: PayloadColor[];
  media: PayloadMedia[];
  products: PayloadProduct[];
  articles: PayloadArticle[];
  article_attributes: PayloadArticleAttribute[];
  article_packaging: PayloadArticlePackaging[];
  product_colors: PayloadProductColor[];
  product_media: PayloadProductMedia[];
  product_accessories: PayloadProductAccessory[];
};

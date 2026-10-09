export type Finding =
  | { kind: "unknown_field"; file: string; field: string; count: number }
  | { kind: "failed_image"; url: string; storagePath: string; reason: string }
  | { kind: "unparsed_attribute"; articleNumber: string; text: string }
  | {
      kind: "partial_attribute";
      articleNumber: string;
      text: string;
      remainder: string;
    }
  | { kind: "material_fallback"; legacyProductId: number; text: string }
  | { kind: "default_color_by_rule"; legacyProductId: number; suffix: string }
  | {
      kind: "merged_color";
      name: string;
      hex: string;
      legacyColorIds: string[];
    }
  | {
      kind: "shared_article";
      articleNumber: string;
      homeLegacyProductId: number;
      accessoryLegacyProductIds: number[];
    }
  | {
      kind: "slug_collision";
      legacyProductId: number;
      slug: string;
      level: "subtitle" | "legacy_id";
    }
  | { kind: "skipped_image"; legacyProductId: number; reference: string }
  | { kind: "packaging_note"; articleNumber: string; text: string }
  | { kind: "alt_text_review"; storagePath: string };

export type MapError = { kind: "invalid_data"; message: string };

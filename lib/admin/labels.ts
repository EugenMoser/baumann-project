import type { Database } from "@/lib/supabase/database.types";

export type ProductStatus = Database["public"]["Enums"]["product_status"];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  archived: "Archiviert",
};

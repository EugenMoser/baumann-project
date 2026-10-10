import type { ProductStatus } from "./labels";

export type ProductFilter = {
  categoryId: number | null;
  status: ProductStatus | null;
  q: string | null;
};
type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;
const STATUSES: readonly ProductStatus[] = ["draft", "published", "archived"];

export function parseFilter(params: Params): ProductFilter {
  const category = first(params.kategorie);
  const status = STATUSES.find((s) => s === first(params.status));
  const q = first(params.q)?.trim().slice(0, 100);
  return {
    categoryId:
      category && /^[1-9]\d{0,9}$/.test(category) ? Number(category) : null,
    status: status ?? null,
    q: q ? q : null,
  };
}

// For .ilike(): user text is matched literally (Review Focus 1).
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

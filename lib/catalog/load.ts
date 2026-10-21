import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Result } from "@/lib/result";
import { getCategoryPage } from "./categories";
import { listCertificates } from "./certificates";
import { getCatalogOverview } from "./overview";
import { getProductPage } from "./product";
import type { CatalogError } from "./types";

// FR-14: not_found → 404; db_error → logged here, generic error to the page.
export function unwrap<T>(result: Result<T, CatalogError>, context: string): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") notFound();
  console.error(
    `[catalog] ${context} failed:`,
    result.error.code,
    result.error.message
  );
  throw new Error("Katalogdaten konnten nicht geladen werden.");
}

// cache(): generateMetadata and the page share one database round trip.
export const loadOverview = cache(async () =>
  unwrap(await getCatalogOverview(), "catalog overview")
);

export const loadCategoryPage = cache(async (slug: string) =>
  unwrap(await getCategoryPage(slug), `category page ${slug}`)
);

export const loadProductPage = cache(
  async (category: string, product: string) =>
    unwrap(
      await getProductPage(category, product),
      `product page ${category}/${product}`
    )
);

export const loadCertificates = cache(async () =>
  unwrap(await listCertificates(), "certificates")
);

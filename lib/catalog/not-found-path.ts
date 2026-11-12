// proxy.ts rewrites unknown catalog slugs here. The leading underscore marks a
// private folder in the App Router, so no route can ever match this path: the
// root not-found page answers with 404 under one fixed cache key instead of an
// ISR entry per random URL.
export const CATALOG_NOT_FOUND_PATH = "/_catalog-not-found";

// D10: up to `max` products of the same category, nearest by sort order first
// (after, then before), wrapping around the list.
export function selectRelated<T extends { slug: string }>(
  sorted: readonly T[],
  currentSlug: string,
  max = 4
): T[] {
  const index = sorted.findIndex((p) => p.slug === currentSlug);
  const n = sorted.length;
  if (index === -1) return sorted.slice(0, max);
  const picked: T[] = [];
  const seen = new Set<number>([index]);
  for (let d = 1; d < n && picked.length < max; d++) {
    for (const j of [(index + d) % n, (index - d + n) % n]) {
      if (picked.length < max && !seen.has(j)) {
        seen.add(j);
        picked.push(sorted[j]);
      }
    }
  }
  return picked;
}

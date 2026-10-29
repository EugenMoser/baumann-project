// Where an image appears on the public site, derived from its role (list
// image vs. gallery) and position. Role values in the database stay
// `thumbnail` / `gallery`; this only names them for admin editors.
export function placementNote(
  rows: readonly { mediaId: string }[],
  thumbnailId: string,
  index: number
): string {
  const row = rows[index];
  if (row?.mediaId === thumbnailId) {
    return rows.length === 1
      ? "Suche, Kategorieübersicht, Produktseite, Kachel"
      : "Suche, Kategorieübersicht";
  }
  const n = rows
    .slice(0, index + 1)
    .filter((r) => r.mediaId !== thumbnailId).length;
  return n === 1 ? "Produktseite (Bild 1), Kachel" : `Produktseite (Bild ${n})`;
}

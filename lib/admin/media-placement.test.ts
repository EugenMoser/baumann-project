import { describe, expect, it } from "vitest";
import { placementNote } from "./media-placement";

const rows = (...ids: string[]) => ids.map((mediaId) => ({ mediaId }));

describe("placementNote (4b SC-6)", () => {
  it("names the list image of a multi-image product", () => {
    expect(placementNote(rows("1", "2"), "1", 0)).toBe(
      "Suche, Kategorieübersicht"
    );
  });

  it("names the only image as list image and gallery", () => {
    expect(placementNote(rows("1"), "1", 0)).toBe(
      "Suche, Kategorieübersicht, Produktseite, Kachel"
    );
  });

  it("marks the first gallery image as tile", () => {
    expect(placementNote(rows("1", "2"), "1", 1)).toBe(
      "Produktseite (Bild 1), Kachel"
    );
  });

  it("counts gallery images around a list image in the middle", () => {
    const r = rows("1", "2", "3");
    expect(placementNote(r, "2", 0)).toBe("Produktseite (Bild 1), Kachel");
    expect(placementNote(r, "2", 1)).toBe("Suche, Kategorieübersicht");
    expect(placementNote(r, "2", 2)).toBe("Produktseite (Bild 2)");
  });
});

import { describe, expect, it } from "vitest";
import { moveAnnouncement, moveItem } from "./sortable";

describe("moveItem (6c SC-4)", () => {
  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });
  it("moves an item down", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("returns an equal copy for the same index", () => {
    const items = ["a", "b"];
    const next = moveItem(items, 1, 1);
    expect(next).toEqual(["a", "b"]);
    expect(next).not.toBe(items);
  });
});

describe("moveAnnouncement (6c SC-4)", () => {
  it("uses the German wording", () => {
    expect(moveAnnouncement("weiß", 1, 3)).toBe(
      "weiß steht jetzt auf Position 1 von 3."
    );
  });
});

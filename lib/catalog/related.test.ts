import { describe, expect, it } from "vitest";
import { selectRelated } from "./related";

const list = ["a", "b", "c", "d", "e", "f"].map((slug) => ({ slug }));
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);

describe("selectRelated (FR-6, SC-6)", () => {
  it("prefers neighbours, alternating after and before", () => {
    expect(slugs(selectRelated(list, "c"))).toEqual(["d", "b", "e", "a"]);
  });

  it("wraps around at the start of the list", () => {
    expect(slugs(selectRelated(list, "a"))).toEqual(["b", "f", "c", "e"]);
  });

  it("never returns the current product or duplicates", () => {
    expect(slugs(selectRelated(list.slice(0, 2), "a"))).toEqual(["b"]);
    expect(selectRelated([{ slug: "a" }], "a")).toEqual([]);
  });

  it("respects max", () => {
    expect(selectRelated(list, "c", 2)).toHaveLength(2);
  });
});

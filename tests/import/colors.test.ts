// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapColors, splitColorName } from "../../scripts/import/map/colors.mts";
import { color, link } from "./factory";

const ids = new Set([9001, 9002]);

describe("splitColorName (FR-6, SC-6)", () => {
  it("splits name and RAL reference", () => {
    expect(splitColorName("testweiß (ähnlich RAL 9016)")).toEqual({
      name: "testweiß",
      ral_reference: "ähnlich RAL 9016",
    });
  });
  it("keeps names without a reference", () => {
    expect(splitColorName(" test blau Vach ")).toEqual({
      name: "test blau Vach",
      ral_reference: null,
    });
  });
});

describe("mapColors (FR-6, SC-6)", () => {
  it("maps used colours with family and default", () => {
    const result = mapColors(
      [
        color(),
        color({ color_id: "3-1", name: "testbraun", code: "#5b3a29" }),
        color({ color_id: "6-9", name: "ungenutzt", code: "kaputt" }),
      ],
      [
        link({ color_id: "3-1", color_suffix: 1 }),
        link({ color_id: "1-1", color_suffix: 0 }),
      ],
      ids
    );
    expect(result).toEqual({
      ok: true,
      value: {
        colors: [
          {
            name: "testbraun",
            ral_reference: null,
            hex_code: "#5B3A29",
            family: "braun",
          },
          {
            name: "testweiß",
            ral_reference: "ähnlich RAL 9016",
            hex_code: "#F2F5F3",
            family: "weiß",
          },
        ],
        product_colors: [
          {
            legacy_product_id: 9001,
            color_name: "testweiß",
            color_hex: "#F2F5F3",
            suffix: "0",
            is_default: true,
            sort_order: 0,
          },
          {
            legacy_product_id: 9001,
            color_name: "testbraun",
            color_hex: "#5B3A29",
            suffix: "1",
            is_default: false,
            sort_order: 1,
          },
        ],
        findings: [],
      },
    });
  });

  it("picks the lowest suffix when there is no suffix 0 and reports it", () => {
    const result = mapColors(
      [color(), color({ color_id: "3-1", name: "testbraun", code: "#5B3A29" })],
      [
        link({ product_id: 9002, color_id: "3-1", color_suffix: 3 }),
        link({ product_id: 9002, color_id: "1-1", color_suffix: 1 }),
      ],
      ids
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.product_colors.find((c) => c.is_default)).toMatchObject(
      { color_name: "testweiß", suffix: "1" }
    );
    expect(result.value.findings).toEqual([
      { kind: "default_color_by_rule", legacyProductId: 9002, suffix: "1" },
    ]);
  });

  it("merges exact duplicates and reports them", () => {
    const result = mapColors(
      [
        color({ color_id: "4-1", name: "testgrau", code: "#8A8D8F" }),
        color({ color_id: "4-2", name: "testgrau", code: "#8a8d8f" }),
      ],
      [
        link({ color_id: "4-1", color_suffix: 0 }),
        link({ color_id: "4-2", color_suffix: 2 }),
        link({ product_id: 9002, color_id: "4-2", color_suffix: 0 }),
      ],
      ids
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.colors).toHaveLength(1);
    expect(
      result.value.product_colors.filter((c) => c.legacy_product_id === 9001)
    ).toEqual([
      {
        legacy_product_id: 9001,
        color_name: "testgrau",
        color_hex: "#8A8D8F",
        suffix: "0",
        is_default: true,
        sort_order: 0,
      },
    ]);
    expect(result.value.findings).toContainEqual({
      kind: "merged_color",
      name: "testgrau",
      hex: "#8A8D8F",
      legacyColorIds: ["4-1", "4-2"],
    });
  });

  it("rejects an unknown family prefix, a bad hex and unknown references", () => {
    expect(
      mapColors([color({ color_id: "7-1" })], [link({ color_id: "7-1" })], ids)
        .ok
    ).toBe(false);
    expect(mapColors([color({ code: "F2F5F3" })], [link()], ids).ok).toBe(
      false
    );
    expect(mapColors([color()], [link({ color_id: "1-9" })], ids).ok).toBe(
      false
    );
    expect(mapColors([color()], [link({ product_id: 9999 })], ids).ok).toBe(
      false
    );
  });
});

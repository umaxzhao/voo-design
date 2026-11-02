// The radial tool menu must offer every member of a family — including Object
// select — and a lone family-key press must arm the member the key names.
import { describe, expect, it } from "vitest";
import {
  PIE_DEFAULT_ITEM_BY_CODE,
  TOOL_FAMILIES,
  getFamilyByCode,
} from "../../src/canvas/editor/tool_families.js";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";

describe("pie menu family coverage", () => {
  it("includes Object select in the marquee family", () => {
    const ids = TOOL_FAMILIES.marquee.items.map((item) => item.id);
    expect(ids).toContain("region");
    expect(ids).toEqual(["region", "rect", "ellipse", "wand"]);
  });

  it("defaults each family key to a member of that family", () => {
    for (const [code, preferredId] of Object.entries(
      PIE_DEFAULT_ITEM_BY_CODE,
    )) {
      const family = getFamilyByCode(code);
      expect(family, code).toBeTruthy();
      const match = family.items.find(
        (item) => item.id === preferredId || item.toolId === preferredId,
      );
      expect(match, `${code} -> ${preferredId}`).toBeTruthy();
    }
  });

  it("maps W to the wand, Z to object select and B to a normal brush", () => {
    expect(PIE_DEFAULT_ITEM_BY_CODE.KeyW).toBe("wand");
    expect(PIE_DEFAULT_ITEM_BY_CODE.KeyZ).toBe("region");
    expect(PIE_DEFAULT_ITEM_BY_CODE.KeyB).toBe("normal");
    expect(PIE_DEFAULT_ITEM_BY_CODE.KeyP).toBe(TOOL.PEN);
    expect(PIE_DEFAULT_ITEM_BY_CODE.KeyR).toBe(TOOL.RECT);
  });
});

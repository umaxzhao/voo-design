import { describe, expect, it, vi } from "vitest";
import { TOOL } from "../../src/canvas/editor/tool_ids.js";
import { TOOL_FAMILIES } from "../../src/canvas/editor/tool_families.js";

describe("selection tool family", () => {
  it("exposes object select and magic wand and activates their existing tools", () => {
    const family = TOOL_FAMILIES.marquee;
    const objectSelect = family.items.find((item) => item.id === "region");
    const magicWand = family.items.find((item) => item.id === "wand");
    const onTool = vi.fn();

    expect(objectSelect).toBeDefined();
    expect(magicWand).toBeDefined();
    expect(family.isActiveItem(objectSelect, { tool: TOOL.REGION })).toBe(true);
    expect(family.isActiveItem(magicWand, { tool: TOOL.WAND })).toBe(true);

    family.applyItem(objectSelect, { onTool });
    family.applyItem(magicWand, { onTool });
    expect(onTool.mock.calls).toEqual([[TOOL.REGION], [TOOL.WAND]]);
  });

  it("keeps marquee modes routed through marqueeMode", () => {
    const family = TOOL_FAMILIES.marquee;
    const onTool = vi.fn();
    const onMarqueeMode = vi.fn();
    const ellipse = family.items.find((item) => item.id === "ellipse");

    family.applyItem(ellipse, { onTool, onMarqueeMode });
    expect(onMarqueeMode).toHaveBeenCalledWith("ellipse");
    expect(onTool).toHaveBeenCalledWith(TOOL.MARQUEE);
  });
});

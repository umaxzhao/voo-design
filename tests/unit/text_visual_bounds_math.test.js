import { describe, expect, it, vi } from "vitest";
import { getTextVisualBounds, resolveEffectiveNode } from "../../src/canvas/editor/image_alpha_bounds.js";
import { nodeAABB } from "../../src/canvas/editor/scene_geometry_bounds.js";

function createMockCtx({
  measureWidth = 20,
  actualBoundingBoxLeft = 0,
  actualBoundingBoxRight = 20,
  ascent = 12,
  descent = 3,
} = {}) {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    font: "",
    letterSpacing: "0px",
    direction: "ltr",
    fontKerning: "auto",
    fontStretch: "normal",
    fontVariantCaps: "normal",
    textRendering: "auto",
    lang: "",
    measureText: vi.fn((_text) => ({
      width: measureWidth,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      fontBoundingBoxAscent: ascent,
      fontBoundingBoxDescent: descent,
      actualBoundingBoxAscent: ascent,
      actualBoundingBoxDescent: descent,
    })),
  };
}

describe("Text visual bounds mathematical models and contracts", () => {
  it("consumes actualBoundingBoxLeft positive distance leftward (counterexample verification)", () => {
    // Counterexample: a glyph whose ink extends 3px to the left of the anchor (actualBoundingBoxLeft = +3)
    // and 10px to the right of the anchor (actualBoundingBoxRight = +10).
    // Stored node width is 10px.
    const ctx = createMockCtx({
      measureWidth: 10,
      actualBoundingBoxLeft: 3, // MDN: positive distance from alignment point to the left
      actualBoundingBoxRight: 10,
    });

    const node = {
      kind: "text",
      x: 100,
      y: 100,
      width: 10,
      height: 15,
      fontSize: 12,
      fontFamily: "Inter, sans-serif",
      text: "f",
      boxWidth: 0,
      align: "left",
    };

    const visual = getTextVisualBounds(ctx, node);
    expect(visual).not.toBeNull();
    // In local coordinates:
    // left edge: 0 - 3 = -3
    // right edge: 0 + 10 = 10
    // visual interval: [-3, 10], width = 13
    expect(visual.x).toBe(-3);
    expect(visual.width).toBe(13);

    // Verify nodeAABB correctly reflects the leftward shift and full width
    const eff = { ...node, effectiveLocal: visual };
    const aabb = nodeAABB(eff);
    expect(aabb.x).toBe(97); // 100 + (-3)
    expect(aabb.width).toBe(13);
  });

  it("handles '40k' overhang where advance width exceeds stored fallback width", () => {
    // 40k scenario:
    // Stored width from fallback font was 18px.
    // Web font loads: advance width is 21.908px, ink extends right to 21.744px,
    // and left ink starts at +0.63px (actualBoundingBoxLeft = -0.63, entirely inside).
    const ctx = createMockCtx({
      measureWidth: 21.908,
      actualBoundingBoxLeft: -0.63,
      actualBoundingBoxRight: 21.744,
    });

    const node = {
      kind: "text",
      x: 100,
      y: 150,
      width: 18,
      height: 15,
      fontSize: 12,
      fontFamily: "Inter, sans-serif",
      text: "40k",
      boxWidth: 0,
      align: "left",
    };

    const visual = getTextVisualBounds(ctx, node);
    expect(visual).not.toBeNull();
    // visualLeft: 0, visualRight: ceil(21.908) = 22
    expect(visual.x).toBe(0);
    expect(visual.width).toBe(22);

    const eff = { ...node, effectiveLocal: visual };
    const aabb = nodeAABB(eff);
    expect(aabb.x).toBe(100);
    expect(aabb.width).toBe(22);
  });

  it("handles center-aligned text and symmetrically encompasses overhang", () => {
    // Center aligned text: node.width = 100, measured text width = 120.
    // spare = -20, localAnchorX = -10.
    // Glyphs span 120px from -10 to +110.
    const ctx = createMockCtx({
      measureWidth: 120,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 120,
    });

    const node = {
      kind: "text",
      x: 200,
      y: 200,
      width: 100,
      height: 20,
      fontSize: 14,
      fontFamily: "Inter, sans-serif",
      text: "Long Center Text",
      boxWidth: 0,
      align: "center",
    };

    const visual = getTextVisualBounds(ctx, node);
    expect(visual).not.toBeNull();
    expect(visual.x).toBe(-10);
    expect(visual.width).toBe(120);

    const eff = { ...node, effectiveLocal: visual };
    const aabb = nodeAABB(eff);
    expect(aabb.x).toBe(190); // 200 + (-10)
    expect(aabb.width).toBe(120);
  });

  it("accounts for strokeWidth outer expansion", () => {
    // Glyph width 20px, stroke width 4px (expands 2px left and 2px right).
    const ctx = createMockCtx({
      measureWidth: 20,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 20,
    });

    const node = {
      kind: "text",
      x: 50,
      y: 50,
      width: 20,
      height: 20,
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      text: "A",
      boxWidth: 0,
      stroke: "#ffffff",
      strokeWidth: 4,
    };

    const visual = getTextVisualBounds(ctx, node);
    expect(visual).not.toBeNull();
    // strokeHalf = 2:
    // lineInkLeft: 0 - 0 - 2 = -2
    // lineInkRight: 0 + 20 + 2 = 22
    expect(visual.x).toBe(-2);
    expect(visual.width).toBe(24);
  });

  it("never attaches effectiveLocal to fixed-width text nodes (boxWidth > 0)", () => {
    const node = {
      kind: "text",
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      fontSize: 12,
      fontFamily: "Inter, sans-serif",
      text: "Fixed width paragraph that does not expand selection",
      boxWidth: 100,
    };

    const eff = resolveEffectiveNode(node, null);
    expect(eff.effectiveLocal).toBeUndefined();
    expect(eff.width).toBe(100);
  });

  it("returns no visual bounds when text fits cleanly inside node dimensions", () => {
    const ctx = createMockCtx({
      measureWidth: 50,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 50,
    });

    const node = {
      kind: "text",
      x: 100,
      y: 100,
      width: 60,
      height: 20,
      fontSize: 14,
      fontFamily: "Inter, sans-serif",
      text: "Fits inside",
      boxWidth: 0,
    };

    const visual = getTextVisualBounds(ctx, node);
    expect(visual).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { drawPlainRects } from "../../src/canvas/editor/render_plain_rects.js";
import { createRectNode } from "../../src/canvas/editor/scene_model.js";

const rect = () => createRectNode({ x: 2, y: 3, width: 18, height: 20, fill: "#3366ff" });
const context = () => ({ fillStyle: "#ff0000", globalAlpha: .4,
  globalCompositeOperation: "multiply", fillRect: vi.fn(),
  save() { this.saved = { fillStyle: this.fillStyle, globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation }; },
  restore() { Object.assign(this, this.saved); } });
describe("plain rectangle rendering", () => {
  it("paints the same bounds and opacity and restores caller state", () => {
    const ctx = context();
    ctx.fillRect.mockImplementation(() => {
      expect(ctx.fillStyle).toBe("#3366ff");
      expect(ctx.globalAlpha).toBe(.6);
      expect(ctx.globalCompositeOperation).toBe("source-over");
    });
    expect(drawPlainRects(ctx, [{ ...rect(), opacity: .6 }])).toBe(true);
    expect(ctx.fillRect).toHaveBeenCalledWith(2, 3, 18, 20);
    expect(ctx).toMatchObject({ fillStyle: "#ff0000", globalAlpha: .4,
      globalCompositeOperation: "multiply" });
  });
  it("honors visibility and hidden/paint filters", () => {
    const ctx = context();
    const nodes = [rect(), rect(), rect(), rect()];
    expect(drawPlainRects(ctx, nodes, { visibleSet: new Set(nodes.slice(0, 3).map(n => n.id)), hiddenNodeId: nodes[1].id, paintNodeIds: new Set([nodes[0].id, nodes[1].id, nodes[3].id]) })).toBe(true);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });
  it("uses one state scope and preserves overlapping node order", () => {
    const ctx = context();
    const save = vi.spyOn(ctx, "save"), restore = vi.spyOn(ctx, "restore");
    const colors = [];
    ctx.fillRect.mockImplementation(() => colors.push(ctx.fillStyle));
    const first = rect(), second = { ...rect(), fill: "#ff6633" };
    expect(drawPlainRects(ctx, [first, { ...rect(), visible: false }, second])).toBe(true);
    expect(colors).toEqual([first.fill, second.fill]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });
  it("rechecks immutable edits and falls back before painting a mixed document", () => {
    const ctx = context(), node = rect();
    expect(drawPlainRects(ctx, [node])).toBe(true);
    ctx.fillRect.mockClear();
    expect(drawPlainRects(ctx, [node, { ...node, id: "edited", cornerRadius: 8 }])).toBe(false);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it.each([
    { rotation: 10 }, { shear: 5 }, { flipH: true }, { flipV: true },
    { cornerRadius: 4 }, { cornerRadius: { tl: 2 } }, { strokeWidth: 1 },
    { noise: { enabled: true, amount: .5 } }, { layerBlur: 2 }, { backgroundBlur: 3 }, { blendMode: "multiply" },
    { fillOpacity: .5 }, { fill: "linear-gradient(red, blue)" },
    { effects: { shadow: { enabled: true } } }, { kind: "ellipse" }, { clipTo: "mask" }, { maskBase: true }, { parentId: "group" },
  ])("leaves complex shapes to the full renderer: %j", patch => {
    const ctx = context();
    expect(drawPlainRects(ctx, [{ ...rect(), ...patch }])).toBe(false);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { drawArtworkNodes } from "../../src/canvas/editor/chrome-artwork-nodes.js";
import { drawNode } from "../../src/canvas/editor/render_nodes.js";

vi.mock("../../src/canvas/editor/render_nodes.js", () => ({ drawNode: vi.fn() }));

const frame = id => ({ id, kind: "group", isFrame: true, visible: true,
  x: id === "a" ? 0 : 200, y: 0, width: 100, height: 100 });
const child = (id, parentId) => ({ id, kind: "rect", parentId, visible: true,
  x: 10, y: 10, width: 10, height: 10 });

function context() {
  const stack = [], callerClip = ["caller"];
  return { canvas: { width: 400, height: 200 }, clips: callerClip, clipCount: 0,
    save() { stack.push(this.clips); },
    restore() { this.clips = stack.pop(); },
    getTransform() { return {}; }, setTransform() {}, beginPath() {},
    rect(x) { this.path = x; },
    clip() { this.clipCount++; this.clips = [...this.clips, this.path]; },
    get saveDepth() { return stack.length; } };
}

function paint(ctx, nodes) {
  drawArtworkNodes(ctx, { doc: { isCanvasRoot: true, nodes }, docVersion: 1 });
}

describe("shared Frame clip runs", () => {
  it("paints consecutive siblings under the same clip with one clip operation", () => {
    const a = frame("a"), b = frame("b");
    const childrenA = Array.from({ length: 100 }, (_, i) => child(`a${i}`, a.id));
    const childrenB = Array.from({ length: 100 }, (_, i) => child(`b${i}`, b.id));
    const nodes = [a, ...childrenA, b, ...childrenB], ctx = context(), painted = [];
    vi.mocked(drawNode).mockImplementation((target, node) => {
      painted.push(node.id);
      expect(target.clips).toEqual(node.parentId ? ["caller", node.parentId === "a" ? 0 : 200] : ["caller"]);
    });
    paint(ctx, nodes);
    expect(painted).toEqual(nodes.map(node => node.id));
    expect(ctx.clips).toEqual(["caller"]);
    expect(ctx.saveDepth).toBe(0);
    expect(ctx.clipCount).toBe(2);
  });

  it("releases a previous clip for a root sibling and restores it when reentering", () => {
    const a = frame("a"), root = child("root"), ctx = context(), clips = [];
    vi.mocked(drawNode).mockImplementation(target => clips.push([...target.clips]));
    paint(ctx, [a, child("first", a.id), root, child("last", a.id)]);
    expect(clips).toEqual([["caller"], ["caller", 0], ["caller"], ["caller", 0]]);
    expect(ctx.clips).toEqual(["caller"]);
    expect(ctx.saveDepth).toBe(0);
  });

  it("restores the caller's state when a descendant fails to paint", () => {
    const a = frame("a"), ctx = context();
    vi.mocked(drawNode).mockImplementation((target, node) => {
      if (node.parentId) throw new Error("Failed descendant");
    });
    expect(() => paint(ctx, [a, child("first", a.id)])).toThrow("Failed descendant");
    expect(ctx.clips).toEqual(["caller"]);
    expect(ctx.saveDepth).toBe(0);
  });
});

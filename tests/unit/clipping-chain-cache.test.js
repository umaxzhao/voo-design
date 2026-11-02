import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/canvas/editor/render_nodes.js", () => ({ drawNode: vi.fn() }));
import { drawClippingChain } from "../../src/canvas/editor/chrome_layers.js";

function context() {
  return { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn() };
}
afterEach(() => vi.unstubAllGlobals());

describe("independent clipping-chain reuse", () => {
  it("reuses every mask across renders and invalidates a hidden-node preview", () => {
    const makeCanvas = vi.fn(() => ({ width: 0, height: 0, getContext: () => context() }));
    vi.stubGlobal("document", { createElement: makeCanvas });
    const shape = (id, extra = {}) => ({ id, kind: "rect", visible: true, opacity: 1,
      x: 0, y: 0, width: 10, height: 10, ...extra });
    const doc = { width: 100, height: 100, nodes: [
      shape("mask-a", { maskBase: true }), shape("a", { clipTo: "mask-a" }),
      shape("mask-b", { maskBase: true }), shape("b", { clipTo: "mask-b" }),
    ] };
    const options = { docVersion: 1, canvasWidth: 100, canvasHeight: 100,
      frameClips: { framesOf: () => [] }, paintNodes: doc.nodes };
    const target = context();
    const paint = () => {
      drawClippingChain(target, doc, 1, "mask-a", options);
      drawClippingChain(target, doc, 3, "mask-b", options);
    };
    paint();
    expect(makeCanvas).toHaveBeenCalledTimes(4);
    paint();
    expect(makeCanvas).toHaveBeenCalledTimes(4);
    const before = target.drawImage.mock.calls.length;
    drawClippingChain(target, doc, 1, "mask-a", { ...options, hiddenNodeId: "a" });
    expect(target.drawImage.mock.calls.length).toBe(before);
  });

  it("repaints a chain when an image finishes decoding without changing the document", () => {
    const makeCanvas = vi.fn(() => ({ width: 0, height: 0, getContext: () => context() }));
    vi.stubGlobal("document", { createElement: makeCanvas });
    const doc = { width: 50, height: 50, nodes: [
      { id: "mask", kind: "rect", visible: true, x: 0, y: 0, width: 10, height: 10 },
      { id: "photo", kind: "rect", fills: [{ fill: "data:image/png;base64,cGl4ZWxz" }], clipTo: "mask", visible: true, x: 0, y: 0, width: 10, height: 10 },
    ] };
    let bitmap;
    const options = { docVersion: 1, canvasWidth: 50, canvasHeight: 50,
      frameClips: { framesOf: () => [] }, bitmapOf: () => bitmap };
    const target = context();
    drawClippingChain(target, doc, 1, "mask", options);
    expect(makeCanvas).toHaveBeenCalledTimes(2);
    bitmap = { width: 10, height: 10 };
    drawClippingChain(target, doc, 1, "mask", options);
    expect(makeCanvas).toHaveBeenCalledTimes(4);
    drawClippingChain(target, doc, 1, "mask", options);
    expect(makeCanvas).toHaveBeenCalledTimes(4);
  });
});

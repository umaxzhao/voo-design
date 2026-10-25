import { describe, expect, it, vi } from "vitest";
import { expandPaintLayer } from "../../src/canvas/editor/editor_paint_layer.js";

function fixture() {
  const pixels = new Map();
  const canvas = { width: 4, height: 4, getContext: () => ({ drawImage: (_source, x, y) => pixels.set("offset", [x, y]) }) };
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (_source, x, y) => pixels.set("offset", [x, y]) }) }) });
  const entry = { canvas };
  const node = { id: "layer", x: 10, y: 20, width: 4, height: 4 };
  let doc = { width: 100, height: 100, nodes: [node] };
  const getDoc = vi.fn(() => doc);
  const setDoc = vi.fn((next) => { doc = next; });
  const result = expandPaintLayer({ getDoc, setDoc, paintCanvases: new Map([[node.id, entry]]), markPaintDirty: vi.fn() }, node, { x: 8, y: 21, width: 4, height: 4 }, true);
  return { result, entry, pixels, node };
}

describe("smudge paint bounds", () => {
  it("grows the target around an outside dab and preserves the old pixel offset", () => {
    const { result, entry, pixels, node } = fixture();
    expect(result).toMatchObject({ x: 8, y: 20, width: 6, height: 5 });
    expect(entry.canvas.width).toBe(6);
    expect(pixels.get("offset")).toEqual([2, 0]);
    expect(result.x + pixels.get("offset")[0]).toBe(node.x);
  });

  it("does not grow when the dab is inside the existing bounds", () => {
    const node = { id: "layer", x: 10, y: 20, width: 4, height: 4 };
    const doc = { width: 100, height: 100, nodes: [node] };
    const canvas = { width: 4, height: 4, getContext: () => ({ drawImage: vi.fn() }) };
    const entry = { canvas };
    const result = expandPaintLayer({ getDoc: () => doc, setDoc: vi.fn(), paintCanvases: new Map([[node.id, entry]]) }, node, { x: 11, y: 21, width: 1, height: 1 }, true);
    expect(result).toBe(node);
    expect(entry.canvas).toBe(canvas);
  });
});

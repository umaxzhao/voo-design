import { describe, expect, it, vi } from "vitest";
import { createWorkspaceSpatialIndex } from "../../src/canvas/editor/workspace-spatial-index.js";
import { SpatialIndex } from "../../src/canvas/editor/spatial_index.js";

const node = { id: "rect", x: 10, y: 20, width: 30, height: 40 };
const page = { id: "page", width: 640, height: 480, isCanvasRoot: true, nodes: [node] };
const layout = new Map([["page", { x: 100, y: 200 }]]);
const at = (index, x, y) => index.pointQuery({ x, y }).map(item => item.id).sort();

describe("workspace geometry reuse", () => {
  it("does not rebuild for selection, camera or equivalent layout wrappers", () => {
    const resolve = createWorkspaceSpatialIndex();
    const first = resolve([page], layout);
    const load = vi.spyOn(SpatialIndex.prototype, "load");
    try {
      for (let i = 0; i < 20; i += 1) {
        expect(resolve([{ ...page, selectedIds: [String(i)] }], new Map(layout))).toBe(first);
      }
      expect(load).not.toHaveBeenCalled();
      expect(at(first, 120, 230)).toEqual(["rect"]);
    } finally { load.mockRestore(); }
  });

  it("refreshes moved, removed and undone nodes without keeping stale hits", () => {
    const resolve = createWorkspaceSpatialIndex();
    const initial = resolve([page], layout);
    const moved = { ...node, x: 500 };
    const edited = resolve([{ ...page, nodes: [moved] }], layout);
    expect(edited).not.toBe(initial);
    expect(at(edited, 120, 230)).toEqual([]);
    expect(at(edited, 610, 230)).toEqual(["rect"]);
    expect(edited.all()[0].node).toBe(moved);
    expect(resolve([{ ...page, nodes: [] }], layout).size).toBe(0);
    expect(at(resolve([page], layout), 120, 230)).toEqual(["rect"]);
  });

  it("tracks offsets, page identity, membership and bounded frame sizes", () => {
    const resolve = createWorkspaceSpatialIndex(40);
    expect(at(resolve([page]), 50, 70)).toEqual(["rect"]);
    expect(at(resolve([page], layout), 120, 230)).toEqual(["rect"]);
    const bounded = { ...page, isCanvasRoot: false };
    expect(at(resolve([bounded], layout), 120, 230)).toEqual(["frame-page", "rect"]);
    const resized = resolve([{ ...bounded, width: 20 }], layout);
    expect(at(resized, 500, 230)).toEqual([]);
    const other = { ...page, id: "other", nodes: [] };
    expect(resolve([other, page], layout).all()[0].docId).toBe("page");
    expect(resolve([])).toBeNull();
    expect(resolve([page], layout)).not.toBe(resized);
  });
});

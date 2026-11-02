import { describe, expect, it, vi } from "vitest";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
const frame = (id, parentId = null, patch = {}) => ({ id, kind: "group", isFrame: true,
  parentId, visible: true, x: 0, y: 0, width: 200, height: 200, ...patch });
const rect = (id, parentId = null, patch = {}) => ({ id, kind: "rect", visible: true,
  parentId, x: 0, y: 0, width: 40, height: 40, fill: "#ff0000", ...patch });
function fixture(nodes) {
  let doc = { width: 600, height: 400, nodes };
  const setDoc = vi.fn(next => { doc = next; });
  const cleanup = vi.fn();
  const api = createEngineNodeOps({ getDoc: () => doc, setDoc,
    selection: { getIds: () => [] }, releaseNodeTextures: cleanup,
    maskTools: { onNodeRemoved: cleanup }, paintTools: {}, penTools: {} });
  return { api, setDoc, cleanup, doc: () => doc };
}

describe("nested container deletion", () => {
  it("deletes an unlocked Frame as a complete subtree, including its locked descendants", () => {
    const f = fixture([frame("outer"), frame("inner", "outer", { locked: true }),
      rect("locked-leaf", "inner", { locked: true }), rect("other")]);
    expect(f.api.removeIds(["outer"])).toBe(true);
    expect(f.doc().nodes.map(n => n.id)).toEqual(["other"]);
    expect(f.setDoc).toHaveBeenCalledOnce();
  });
  it("does not release a clipping mask or textures when the selected base is locked", () => {
    const f = fixture([frame("outer"), rect("base", "outer", { locked: true }), rect("paint", "outer", { clipTo: "base" })]);
    expect(f.api.removeIds(["base"])).toBe(false);
    expect(f.doc().nodes.find(n => n.id === "paint").clipTo).toBe("base");
    expect(f.setDoc).not.toHaveBeenCalled(); expect(f.cleanup).not.toHaveBeenCalled();
  });
  it("does not delete or invalidate a child beneath a locked Frame", () => {
    const f = fixture([frame("outer", null, { locked: true }), rect("child", "outer")]);
    expect(f.api.removeIds(["child"])).toBe(false);
    expect(f.doc().nodes).toHaveLength(2); expect(f.cleanup).not.toHaveBeenCalled();
  });
});

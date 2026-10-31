import { describe, expect, it, vi } from "vitest";
import { insertGroup } from "../../src/canvas/editor/doc_ops_groups.js";
import { createEngineGroups } from "../../src/canvas/editor/editor_engine_groups.js";
import { frameSelectionUnit } from "../../src/canvas/editor/frame-selection-unit.js";

const frame = (id, parentId = null) => ({ id, kind: "group", isFrame: true, parentId,
  x: 0, y: 0, width: 500, height: 400, visible: true });
const rect = (id, parentId) => ({ id, kind: "rect", parentId, x: 50, y: 50, width: 40, height: 30, visible: true });
const fixture = (nodes, ids) => {
  let doc = { width: 600, height: 500, nodes };
  const select = vi.fn(), setDoc = vi.fn(next => { doc = next; });
  const api = createEngineGroups({ getDoc: () => doc, setDoc, select, selectMany: vi.fn(),
    selection: { getIds: () => ids },
    clickUnitOf: node => frameSelectionUnit(doc, node),
    selectionUnits: () => [...new Set(ids.map(id => frameSelectionUnit(doc, doc.nodes.find(n => n.id === id))))],
  });
  return { api, select, setDoc, doc: () => doc };
};

describe("group commands inside Frames", () => {
  it("keeps a new sibling group inside the shared parent Frame", () => {
    const doc = { width: 600, height: 500, nodes: [frame("frame"), rect("a", "frame"), rect("b", "frame")] };
    const next = insertGroup(doc, { id: "group", kind: "group", parentId: null, x: 50, y: 50, width: 40, height: 30 }, ["a", "b"]);
    expect(next.nodes.find(n => n.id === "group").parentId).toBe("frame");
    expect(next.nodes.filter(n => ["a", "b"].includes(n.id)).every(n => n.parentId === "group")).toBe(true);
  });
  it("selects the newly created group as the next movement unit", () => {
    const f = fixture([frame("frame"), rect("a", "frame"), rect("b", "frame")], ["a", "b"]);
    f.api.groupSelection();
    const group = f.doc().nodes.find(n => n.kind === "group" && !n.isFrame);
    expect(f.select).toHaveBeenCalledWith(group.id);
  });
  it("ungroups the selected ordinary unit without dissolving either ancestor Frame", () => {
    const f = fixture([frame("outer"), frame("inner", "outer"),
      { ...frame("folder", "inner"), isFrame: false }, rect("a", "folder"), rect("b", "folder")], ["a", "b"]);
    f.api.ungroupSelection();
    expect(f.doc().nodes.filter(n => n.isFrame).map(n => n.id)).toEqual(["outer", "inner"]);
    expect(f.doc().nodes.find(n => n.id === "folder")).toBeUndefined();
    expect(f.doc().nodes.find(n => n.id === "a").parentId).toBe("inner");
  });
  it("does not offer or execute ungroup on a loose child of a Frame", () => {
    const f = fixture([frame("outer"), rect("a", "outer")], ["a"]);
    expect(f.api.canUngroupSelection()).toBe(false);
    f.api.ungroupSelection(); expect(f.setDoc).not.toHaveBeenCalled();
  });
  it("does not dissolve a locked selected container", () => {
    const f = fixture([{ ...frame("folder"), isFrame: false, locked: true }, rect("a", "folder")], ["folder"]);
    f.api.ungroupSelection(); expect(f.setDoc).not.toHaveBeenCalled();
  });
  it("does not offer grouping for one Frame plus its already-contained selected leaf", () => {
    const f = fixture([frame("frame"), rect("a", "frame")], ["frame", "a"]);
    expect(f.api.canGroupSelection()).toBe(false); f.api.groupSelection();
    expect(f.setDoc).not.toHaveBeenCalled();
  });
  it("uses selected subtree roots for an Auto Layout wrapper's initial bounds", () => {
    const f = fixture([frame("frame"), { ...rect("a", "frame"), x: 900 }, { ...rect("loose", null), x: 550 }], ["frame", "a", "loose"]);
    f.api.toggleAutoLayoutSelection();
    const wrapper = f.doc().nodes.find(node => node.autoLayout);
    expect(wrapper.width).toBe(590);
    expect(f.doc().nodes.find(node => node.id === "a").parentId).toBe("frame");
  });
});

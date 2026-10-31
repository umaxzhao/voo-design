import { describe, expect, it, vi } from "vitest";
import { reorderNodes } from "../../src/canvas/editor/doc_ops_groups.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";

const documentWith = (ids) => ({ width: 500, height: 500, nodes: ids.map((id) => ({
  id, kind: "rect", x: 0, y: 0, width: 20, height: 20,
})) });
const order = (doc) => doc.nodes.map((node) => node.id);

describe("batch layer order", () => {
  it("keeps selected order independent of click order", () => {
    const doc = documentWith(["a", "b", "c", "d"]);
    expect(order(reorderNodes(doc, ["c", "b"], 1))).toEqual(["a", "d", "b", "c"]);
    expect(order(reorderNodes(doc, ["b", "c"], -1))).toEqual(["b", "c", "a", "d"]);
  });

  it("does not exchange selected neighbors at a stack boundary", () => {
    const doc = documentWith(["a", "b", "c"]);
    expect(reorderNodes(doc, ["b", "c"], 1)).toBe(doc);
    expect(reorderNodes(doc, ["a", "b"], -1)).toBe(doc);
    expect(reorderNodes(documentWith([]), ["missing"], 1).nodes).toEqual([]);
  });

  it("respects locked nodes and parent boundaries", () => {
    const doc = documentWith(["a", "b", "c"]);
    doc.nodes[1].locked = true;
    expect(reorderNodes(doc, ["a"], 1)).toBe(doc);
    doc.nodes[1].locked = false;
    doc.nodes[1].parentId = "group";
    doc.nodes[2].parentId = "group";
    expect(reorderNodes(doc, ["a"], 1)).toBe(doc);
  });

  it("commits the entire batch through one document history boundary", () => {
    let doc = documentWith(["a", "b", "c", "d"]);
    const setDoc = vi.fn((next) => { doc = next; });
    const engine = createEngineNodeOps({ getDoc: () => doc, setDoc });
    engine.reorderNodes(["c", "b"], 1);
    expect(order(doc)).toEqual(["a", "d", "b", "c"]);
    expect(setDoc).toHaveBeenCalledOnce();
  });

  it("moves a selected group and its children together", () => {
    const doc = documentWith(["g", "a", "b", "c"]);
    doc.nodes[0].kind = "group";
    doc.nodes[1].parentId = "g";
    doc.nodes[2].parentId = "g";
    expect(order(reorderNodes(doc, ["g", "a"], 1))).toEqual(["c", "g", "a", "b"]);
    expect(order(reorderNodes(doc, ["c"], -1))).toEqual(["c", "g", "a", "b"]);
    doc.nodes[1].locked = true;
    expect(reorderNodes(doc, ["g"], 1)).toBe(doc);
  });

  it("moves a Frame and all its children together without splitting", () => {
    const doc = documentWith(["f", "c1", "c2", "other"]);
    doc.nodes[0].kind = "frame";
    doc.nodes[1].parentId = "f";
    doc.nodes[2].parentId = "f";
    expect(order(reorderNodes(doc, ["f"], 1))).toEqual(["other", "f", "c1", "c2"]);
    expect(order(reorderNodes(doc, ["other"], -1))).toEqual(["other", "f", "c1", "c2"]);
  });

  it("moves a clipped layer together with its mask base during reorder", () => {
    const doc = documentWith(["base", "clipped", "other"]);
    doc.nodes[1].clipTo = "base";
    expect(order(reorderNodes(doc, ["base"], 1))).toEqual(["other", "base", "clipped"]);
    expect(order(reorderNodes(doc, ["other"], -1))).toEqual(["other", "base", "clipped"]);
  });

  it("moves a node to extreme front and back within its parent frame boundary", () => {
    const doc = documentWith(["f1", "a", "b", "c", "f2", "d"]);
    doc.nodes[0].kind = "frame";
    doc.nodes[1].parentId = "f1";
    doc.nodes[2].parentId = "f1";
    doc.nodes[3].parentId = "f1";
    doc.nodes[4].kind = "frame";
    doc.nodes[5].parentId = "f2";

    let current = doc;
    const setDoc = (next) => { current = next; };
    const selection = { getIds: () => ["a"] };
    const engine = createEngineNodeOps({ getDoc: () => current, setDoc, selection });

    engine.moveToFront(["a"]);
    expect(order(current)).toEqual(["f1", "b", "c", "a", "f2", "d"]);

    engine.moveToBack(["a"]);
    expect(order(current)).toEqual(["f1", "a", "b", "c", "f2", "d"]);
  });

  it("moves an entire Frame to extreme front and back with all its children", () => {
    const doc = documentWith(["f1", "a", "b", "f2", "c", "d"]);
    doc.nodes[0].kind = "frame";
    doc.nodes[1].parentId = "f1";
    doc.nodes[2].parentId = "f1";
    doc.nodes[3].kind = "frame";
    doc.nodes[4].parentId = "f2";
    doc.nodes[5].parentId = "f2";

    let current = doc;
    const setDoc = (next) => { current = next; };
    const selection = { getIds: () => ["f1"] };
    const engine = createEngineNodeOps({ getDoc: () => current, setDoc, selection });

    engine.bringToFront(["f1"]);
    expect(order(current)).toEqual(["f2", "c", "d", "f1", "a", "b"]);

    engine.sendToBack(["f1"]);
    expect(order(current)).toEqual(["f1", "a", "b", "f2", "c", "d"]);
  });

  it("supports engine.bringForward and sendBackward on selection and selected group", () => {
    const doc = documentWith(["g", "c1", "c2", "outside"]);
    doc.nodes[0].kind = "group";
    doc.nodes[1].parentId = "g";
    doc.nodes[2].parentId = "g";

    let current = doc;
    const setDoc = (next) => { current = next; };
    const selection = { getIds: () => ["c1", "c2"] };
    const getSelectedGroup = () => current.nodes.find((n) => n.id === "g");
    const engine = createEngineNodeOps({ getDoc: () => current, setDoc, selection, getSelectedGroup });

    engine.bringForward();
    expect(order(current)).toEqual(["outside", "g", "c1", "c2"]);

    engine.sendBackward();
    expect(order(current)).toEqual(["g", "c1", "c2", "outside"]);
  });
});

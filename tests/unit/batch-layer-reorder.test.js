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
});

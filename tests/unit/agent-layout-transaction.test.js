import { describe, expect, it } from "vitest";
import { mutateLayerGeometry } from "../../src/canvas/agent/agent-layout-transaction.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import { createEngineDocumentController } from "../../src/canvas/editor/editor_engine_document.js";
import { createBooleanNode, createRectNode } from "../../src/canvas/editor/scene_model.js";

function engineFixture(nodes) {
  let doc = { width: 600, height: 400, nodes };
  const history = createHistory();
  history.reset(doc);
  const getDoc = () => doc;
  const setDoc = (next, { commit = true } = {}) => {
    doc = next;
    if (commit) history.push(doc);
  };
  const editor = {
    ...createEngineNodeOps({ getDoc, setDoc }),
    ...createEngineDocumentController({ getDoc, setDoc, crop: {}, viewportTools: {}, cameraMode: "shared" }),
    getNode: (id) => doc.nodes.find((node) => node.id === id),
    getDoc,
    setDoc,
  };
  return { editor, history, undo: () => { doc = history.undo(); }, redo: () => { doc = history.redo(); } };
}

function booleanFixture(children) {
  const a = { ...createRectNode({ x: 100, y: 100, width: 100, height: 80 }), id: "a" };
  const b = { ...createRectNode({ x: 150, y: 100, width: 100, height: 80 }), id: "b" };
  const combined = { ...createBooleanNode([a, b], "union"), id: "boolean" };
  return children ? [combined, { ...a, parentId: combined.id }, { ...b, parentId: combined.id }] : [combined];
}

function containerFixture(kind) {
  if (kind === "boolean") return { nodes: booleanFixture(true), id: "boolean", childId: "a" };
  return { id: "container", childId: "child", nodes: [
    { id: "container", kind: "group", isFrame: kind === "frame", x: 100, y: 100, width: 200, height: 100 },
    { id: "nested", kind: "group", parentId: "container", x: 110, y: 120, width: 30, height: 20 },
    { id: "child", kind: "rect", parentId: "nested", x: 115, y: 125, width: 10, height: 10 },
  ] };
}

const lockedCases = ["root", "root-position", "ancestor", "descendant", "descendant-position", "clip", "clip-position", "clip-ancestor"];

describe("MCP layout engine transactions", () => {
  it.each([false, true])("moves and resizes child-backed=%s Boolean geometry with exactly one undo", (children) => {
    const { editor, history, undo, redo } = engineFixture(booleanFixture(children));
    const before = structuredClone(editor.getDoc());
    mutateLayerGeometry(editor, editor.getNode("boolean"), { x: 120, y: 110, width: 300, height: 160 });
    expect(editor.getNode("boolean")).toMatchObject({ x: 120, y: 110, width: 300, height: 160 });
    expect(editor.getNode("boolean").sources.map((source) => [source.x, source.y, source.w, source.h]))
      .toEqual([[0, 0, 200, 160], [100, 0, 200, 160]]);
    expect(editor.getDoc().nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
    if (children) expect(editor.getNode("b")).toMatchObject({ x: 220, y: 110, width: 200, height: 160 });
    expect(history.getEntries()).toHaveLength(2);
    const after = structuredClone(editor.getDoc());
    undo();
    expect(editor.getDoc()).toEqual(before);
    redo();
    expect(editor.getDoc()).toEqual(after);
  });

  it("moves a Group's nested descendants and clipped followers once while resizing in one history entry", () => {
    const { editor, history, undo } = engineFixture([
      { id: "group", kind: "group", x: 100, y: 100, width: 150, height: 80 },
      { id: "nested", kind: "group", parentId: "group", x: 110, y: 120, width: 30, height: 20 },
      { id: "child", kind: "rect", parentId: "nested", x: 115, y: 125, width: 10, height: 10 },
      { id: "clip", kind: "rect", clipTo: "child", x: 116, y: 126, width: 5, height: 5 },
      { id: "outside", kind: "rect", x: 400, y: 20, width: 10, height: 10 },
    ]);
    const before = structuredClone(editor.getDoc());
    mutateLayerGeometry(editor, editor.getNode("group"), { x: 120, y: 110, width: 300, height: 160 });
    expect(editor.getDoc().nodes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [120, 110, 300, 160], [130, 130, 30, 20], [135, 135, 10, 10], [136, 136, 5, 5], [400, 20, 10, 10],
    ]);
    expect(history.getEntries()).toHaveLength(2);
    undo();
    expect(editor.getDoc()).toEqual(before);
  });

  it("moves and resizes a Frame through the same pinned-child path as the inspector with one undo", () => {
    const { editor, history, undo } = engineFixture([
      { id: "frame", kind: "group", isFrame: true, x: 100, y: 100, width: 200, height: 100 },
      { id: "pinned", kind: "rect", parentId: "frame", x: 260, y: 160, width: 20, height: 20,
        constraints: { horizontal: "right", vertical: "bottom" } },
      { id: "nested", kind: "group", parentId: "frame", x: 110, y: 120, width: 30, height: 20 },
      { id: "child", kind: "rect", parentId: "nested", x: 115, y: 125, width: 10, height: 10 },
    ]);
    const before = structuredClone(editor.getDoc());
    mutateLayerGeometry(editor, editor.getNode("frame"), { x: 120, y: 110, width: 300, height: 160, rotation: 5 });
    expect(editor.getNode("frame")).toMatchObject({ x: 120, y: 110, width: 300, height: 160, rotation: 5 });
    expect(editor.getNode("pinned")).toMatchObject({ x: 380, y: 230, width: 20, height: 20 });
    expect(editor.getNode("child")).toMatchObject({ x: 135, y: 135 });
    expect(history.getEntries()).toHaveLength(2);
    undo();
    expect(editor.getDoc()).toEqual(before);
  });

  it.each([{ width: 150 }, { rotation: 0 }])("records a Group move when the remaining patch is unchanged: %j", (unchanged) => {
    const { editor, history, undo } = engineFixture([
      { id: "group", kind: "group", x: 100, y: 100, width: 150, height: 80, rotation: 0 },
      { id: "child", kind: "rect", parentId: "group", x: 110, y: 120, width: 10, height: 10 },
    ]);
    const before = structuredClone(editor.getDoc());
    mutateLayerGeometry(editor, editor.getNode("group"), { x: 120, y: 110, ...unchanged });
    expect(editor.getNode("group")).toMatchObject({ x: 120, y: 110, width: 150, height: 80, rotation: 0 });
    expect(editor.getNode("child")).toMatchObject({ x: 130, y: 130 });
    expect(history.getEntries()).toHaveLength(2);
    undo();
    expect(editor.getDoc()).toEqual(before);
  });

  it.each(["boolean", "frame", "group"].flatMap((kind) => lockedCases.map((scope) => [kind, scope])))
    ("rejects the entire %s move/resize before history when %s is locked", (kind, scope) => {
      const { nodes, id, childId } = containerFixture(kind);
      const root = nodes.find((node) => node.id === id);
      const child = nodes.find((node) => node.id === childId);
      if (scope === "root") root.locked = true;
      if (scope === "root-position") root.lockPosition = true;
      if (scope === "ancestor") {
        root.parentId = "locked-parent";
        nodes.unshift({ id: "locked-parent", kind: "group", locked: true });
      }
      if (scope === "descendant") child.locked = true;
      if (scope === "descendant-position") child.lockPosition = true;
      if (scope.startsWith("clip")) {
        nodes.push({ id: "clip", kind: "rect", clipTo: childId, x: 116, y: 126, width: 5, height: 5,
          ...(scope === "clip" ? { locked: true } : {}),
          ...(scope === "clip-position" ? { lockPosition: true } : {}),
          ...(scope === "clip-ancestor" ? { parentId: "locked-parent" } : {}) });
        if (scope === "clip-ancestor") nodes.push({ id: "locked-parent", kind: "group", locked: true });
      }
      const { editor, history } = engineFixture(nodes);
      const before = editor.getDoc();
      const unchanged = structuredClone(before);
      expect(mutateLayerGeometry(editor, root, { x: 120, y: 110, width: 300, height: 160 })).toBe(false);
      expect(editor.getDoc()).toBe(before);
      expect(editor.getDoc()).toEqual(unchanged);
      expect(history.getEntries()).toHaveLength(1);
    });

  it.each(["boolean", "frame", "group"])("moves external chained clip followers of %s and undoes the entire command once", (kind) => {
    const { nodes, id } = containerFixture(kind);
    nodes.push(
      { id: "clip", kind: "rect", clipTo: id, x: 110, y: 120, width: 10, height: 10 },
      { id: "clip-chain", kind: "rect", clipTo: "clip", x: 115, y: 125, width: 5, height: 5 },
    );
    const { editor, history, undo } = engineFixture(nodes);
    const before = structuredClone(editor.getDoc());
    expect(mutateLayerGeometry(editor, editor.getNode(id), { x: 120, y: 110, width: 300, height: 160 })).toBe(true);
    expect(editor.getNode("clip")).toMatchObject({ x: 130, y: 130, width: 10, height: 10 });
    expect(editor.getNode("clip-chain")).toMatchObject({ x: 135, y: 135, width: 5, height: 5 });
    expect(history.getEntries()).toHaveLength(2);
    undo();
    expect(editor.getDoc()).toEqual(before);
  });

  it("keeps the existing pure Frame resize policy for locked pinned children", () => {
    const { editor, history } = engineFixture([
      { id: "frame", kind: "group", isFrame: true, lockPosition: true, x: 100, y: 100, width: 200, height: 100 },
      { id: "pinned", kind: "rect", parentId: "frame", locked: true, x: 260, y: 160, width: 20, height: 20,
        constraints: { horizontal: "right", vertical: "bottom" } },
    ]);
    expect(mutateLayerGeometry(editor, editor.getNode("frame"), { x: 100, y: 100, width: 300, height: 160 })).toBe(true);
    expect(editor.getNode("pinned")).toMatchObject({ x: 360, y: 220, width: 20, height: 20 });
    expect(history.getEntries()).toHaveLength(2);
  });
});

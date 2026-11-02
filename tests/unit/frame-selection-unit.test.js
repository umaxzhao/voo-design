import { describe, expect, it } from "vitest";
import { createEngineNodesController } from "../../src/canvas/editor/editor_engine_nodes.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";
import { nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { frameSelectionUnit } from "../../src/canvas/editor/frame-selection-unit.js";
import { topLevelGroupOf } from "../../src/canvas/editor/scene_model_groups.js";

const box = { x: 0, y: 0, width: 400, height: 300, visible: true };
const frame = { ...box, id: "frame", kind: "group", isFrame: true, clipContent: true };
const first = { ...box, id: "first", kind: "rect", x: 100, y: 100, width: 32, height: 32, parentId: frame.id };
const second = { ...first, id: "second", x: 200 };
const group = { ...box, id: "group", kind: "group", parentId: frame.id };
const inner = { ...first, id: "inner", parentId: group.id };
const sibling = { ...second, id: "sibling", parentId: group.id };

function controller(nodes) {
  let doc = { width: 1200, height: 800, isCanvasRoot: true, nodes };
  return createEngineNodesController({ getDoc: () => doc, setDoc: next => { doc = next; },
    selection: createSelection(), getEffectiveNode: node => node, requestRender() {}, notify() {}, cache: {} });
}

describe("Frame selection boundaries", () => {
  it("keeps a direct child independent while preserving structural ancestry queries", () => {
    const doc = { nodes: [frame, first, second] };
    expect(frameSelectionUnit(doc, first)).toBe(first);
    expect(topLevelGroupOf(doc, first)).toBe(frame);
    const api = controller(doc.nodes);
    api.select(first.id);
    expect(api.getSelectedIds()).toEqual([first.id]);
    expect(api.getSelectedGroup()).toBeNull();
    expect(api.selectionUnits()).toEqual([first]);
  });

  it("selects ordinary groups inside a Frame as a unit and supports entering them", () => {
    const api = controller([frame, group, inner, sibling]);
    api.select(inner.id);
    expect(api.getSelectedIds()).toEqual([inner.id, sibling.id]);
    expect(api.getSelectedGroup()?.id).toBe(group.id);
    expect(api.selectionUnits()).toEqual([group]);
    api.setIsolationGroupId(group.id);
    api.select(inner.id);
    expect(api.getSelectedIds()).toEqual([inner.id]);
  });

  it("retains ordinary group promotion outside a Frame", () => {
    const folder = { ...group, parentId: null };
    const doc = { nodes: [folder, inner, sibling] };
    expect(frameSelectionUnit(doc, inner)).toBe(folder);
    const api = controller(doc.nodes);
    api.select(inner.id);
    expect(api.getSelectedIds()).toEqual([inner.id, sibling.id]);
    expect(api.getSelectedGroup()?.id).toBe(folder.id);
  });

  it("allows exact/multi/Shift-style child sets without promoting them back to a Frame", () => {
    const api = controller([frame, first, second]);
    api.select(first.id); api.toggleSelect(second.id);
    expect(api.getSelectedIds()).toEqual([first.id, second.id]);
    expect(api.selectionUnits()).toEqual([first, second]);
    api.toggleSelect(first.id);
    expect(api.getSelectedIds()).toEqual([second.id]);
    api.selectMany([first.id, second.id]);
    expect(api.selectionUnits()).toEqual([first, second]);
  });

  it("selects the Frame itself so movement expands to its descendants once", () => {
    const api = controller([frame, first, second]);
    api.select(frame.id);
    expect(api.getSelectedIds()).toEqual([frame.id]);
    expect(api.getSelectedGroup()?.id).toBe(frame.id);
    expect(new Set(api.expandMoveSet([frame.id]))).toEqual(new Set([frame.id, first.id, second.id]));
    api.selectGroup(frame.id);
    expect(api.getSelectedIds()).toEqual([frame.id]);
    expect(api.selectionUnits()).toEqual([frame]);
  });

  it("stops at the nearest nested Frame and still promotes Boolean containers", () => {
    const nested = { ...frame, id: "nested", parentId: frame.id };
    const boolean = { ...box, id: "boolean", kind: "boolean", parentId: nested.id };
    const node = { ...first, parentId: boolean.id };
    expect(frameSelectionUnit({ nodes: [frame, nested, boolean, node] }, node)).toBe(boolean);
  });

  it("does not loop or promote a child through malformed ancestry", () => {
    const broken = { ...first, parentId: "missing" };
    expect(frameSelectionUnit({ nodes: [broken] }, broken)).toBe(broken);
    const cyclic = { ...group, parentId: first.id };
    const node = { ...first, parentId: group.id };
    expect(frameSelectionUnit({ nodes: [node, cyclic] }, node)).toBe(node);
  });
});

describe("Frame hit surfaces", () => {
  it("hits children before the Frame, and the Frame only on its empty surface", () => {
    const doc = { nodes: [frame, first, second] };
    expect(nodeAtPoint(doc, { x: 116, y: 116 })?.id).toBe(first.id);
    expect(nodeAtPoint(doc, { x: 216, y: 116 })?.id).toBe(second.id);
    expect(nodeAtPoint(doc, { x: 300, y: 230 })?.id).toBe(frame.id);
    expect(nodeAtPoint(doc, { x: 500, y: 230 })).toBeNull();
  });

  it("keeps ordinary folders non-interactive and honors hidden/locked Frame ancestry", () => {
    expect(nodeAtPoint({ nodes: [{ ...frame, isFrame: false }, first] }, { x: 300, y: 230 })).toBeNull();
    expect(nodeAtPoint({ nodes: [{ ...frame, visible: false }, first] }, { x: 116, y: 116 })).toBeNull();
    expect(nodeAtPoint({ nodes: [{ ...frame, locked: true }, first] }, { x: 116, y: 116 })).toBeNull();
  });
});

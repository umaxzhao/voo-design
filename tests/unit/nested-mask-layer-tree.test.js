import { describe, expect, it } from "vitest";
import buildEditorLayerTree from "../../src/canvas/components/editor_layer_tree_model.js";

const group = { id: "frame", kind: "group", isFrame: true };
const base = { id: "base", kind: "rect", parentId: "frame" };
const paint = { id: "paint", kind: "rect", parentId: "frame", clipTo: "base" };
const tree = objects => buildEditorLayerTree({ objects, canvasPages: [], activeCanvasId: "page",
  query: "", labels: {}, t: key => key, collapsedIds: new Set(), collapsedCanvasIds: new Set(),
  collapsedGroupIdsByCanvas: new Map(), backgroundColor: "transparent", activeIndex: -1 });

describe("nested mask layer tree", () => {
  it("renders a clipped sibling exactly once beneath its base", () => {
    const { rows } = tree([group, base, paint]);
    expect(rows.map(row => [row.node.id, row.depth])).toEqual([["frame", 0], ["base", 1], ["paint", 2]]);
  });
  it("keeps an invalid cross-owner clipping reference visible in its own Frame", () => {
    const { rows } = tree([group, { ...base, parentId: null }, paint]);
    expect(rows.map(row => row.node.id).sort()).toEqual(["base", "frame", "paint"]);
    expect(rows.find(row => row.node.id === "paint").depth).toBe(1);
  });
  it("does not recurse or hide layers when legacy masks contain a cycle", () => {
    const { rows } = tree([group, { ...base, clipTo: "paint" }, paint]);
    expect(rows.map(row => row.node.id).sort()).toEqual(["base", "frame", "paint"]);
  });
});

import { describe, expect, it } from "vitest";
import * as booleanApi from "../../src/canvas/editor/path_boolean_engine.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";

const publicArity = {
  adaptiveFlattenCubicSegment: 4,
  booleanExclude: 1,
  booleanIntersect: 1,
  booleanSubtract: 1,
  booleanUnion: 1,
  clipMultiLoopShapes: 3,
  clipPolygonPair: 3,
  ensurePositiveOrientation: 1,
  isPointInMultiLoopShape: 2,
  isPointInPolygon: 2,
  normalizeNodeToDocPenAnchors: 1,
  polygonSignedArea: 1,
  ptEq: 2,
  reconstructAnchorsFromLoop: 1,
  reconstructBezierPath: 2,
  solveSegmentIntersection: 4,
  subdivideMultiLoops: 2,
  tessellateNodeToWorldPolygon: 1,
  tessellateNodeToWorldPolygons: 1,
};

function rectangle(id, x, y) {
  return { id, kind: "rect", x, y, width: 100, height: 100,
    fill: "#ff0000", stroke: "transparent", strokeWidth: 0, visible: true };
}

function controller(nodes, ids = nodes.map(node => node.id)) {
  let doc = { width: 400, height: 300, nodes };
  const selection = createSelection();
  selection.selectNodes(ids);
  const commits = [];
  const api = createEngineNodeOps({
    getDoc: () => doc,
    setDoc: (next) => { commits.push(next); doc = next; },
    selection,
  });
  return { api, commits, document: () => doc, selectedIds: () => selection.getIds() };
}

describe("synchronous vector Boolean compatibility", () => {
  it("retains every public geometry export and default-parameter arity", () => {
    expect(Object.keys(booleanApi).sort()).toEqual(Object.keys(publicArity).sort());
    for (const [name, arity] of Object.entries(publicArity)) {
      expect(typeof booleanApi[name]).toBe("function");
      expect(booleanApi[name].length).toBe(arity);
    }
  });

  it.each(["union", "subtract", "intersect", "exclude"])(
    "%s commits the complete path and selection before returning once",
    (operation) => {
      const state = controller([rectangle("a", 40, 50), rectangle("b", 100, 80)]);
      const result = state.api.destructiveBoolean(operation);
      expect(result).toBe(true);
      expect(state.commits).toHaveLength(1);
      const nodes = state.document().nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({ kind: "path", pen: true, fillRule: "evenodd" });
      expect(nodes[0].points.length).toBeGreaterThan(2);
      expect(state.selectedIds()).toEqual([nodes[0].id]);
    },
  );

  it("rejects a locked Boolean selection without creating history or changing it", () => {
    const source = [rectangle("a", 40, 50), { ...rectangle("b", 100, 80), locked: true }];
    const state = controller(source);
    expect(state.api.destructiveBoolean("union")).toBe(false);
    expect(state.commits).toHaveLength(0);
    expect(state.document().nodes).toBe(source);
    expect(state.selectedIds()).toEqual(["a", "b"]);
  });

  it("keeps Expand Stroke synchronous and commits one outlined path", () => {
    const state = controller([{ ...rectangle("stroke", 40, 50), stroke: "#0000ff", strokeWidth: 20 }]);
    expect(state.api.expandSelectedStroke()).toBe(true);
    expect(state.commits).toHaveLength(1);
    expect(state.document().nodes).toHaveLength(1);
    expect(state.document().nodes[0]).toMatchObject({ id: "stroke", kind: "path", pen: true, fill: "#0000ff" });
    expect(state.selectedIds()).toEqual(["stroke"]);
  });

  it("preserves clipping references when expanding a layer's stroke", () => {
    const stroke = { ...rectangle("stroke", 40, 50), stroke: "#0000ff", strokeWidth: 20 };
    const clipped = { ...rectangle("clipped", 40, 50), clipTo: stroke.id };
    const state = controller([stroke, clipped], [stroke.id]);
    expect(state.api.expandSelectedStroke()).toBe(true);
    expect(state.document().nodes).toHaveLength(2);
    expect(state.document().nodes[0].id).toBe(stroke.id);
    expect(state.document().nodes[1]).toBe(clipped);
    expect(state.document().nodes.find(node => node.id === clipped.clipTo)?.kind).toBe("path");
  });
});

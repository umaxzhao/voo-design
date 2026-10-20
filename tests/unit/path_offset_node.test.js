import { describe, it, expect } from "vitest";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";
import { createPenNode } from "../../src/canvas/editor/scene_model_paths.js";
import { offsetPathNode } from "../../src/canvas/editor/path_offset_node.js";
import { OFFSET_FAILURE } from "../../src/canvas/editor/path_offset.js";

/** A closed pen node whose world-space square spans (200,300)–(300,400). */
function squareNode(strokeWidth = 2) {
  const anchors = [
    { x: 200, y: 300, in: null, out: null },
    { x: 300, y: 300, in: null, out: null },
    { x: 300, y: 400, in: null, out: null },
    { x: 200, y: 400, in: null, out: null, close: true },
  ];
  return createPenNode(anchors, "#000000", strokeWidth);
}

/** World-space anchor positions of a rebuilt node (unit scale after rebase). */
function worldPoints(node) {
  return node.points.map((p) => ({ x: node.x + p.x, y: node.y + p.y }));
}

describe("offsetPathNode", () => {
  it("outsets a pen node and grows its box by the offset on each side", () => {
    const node = squareNode(2);
    const result = offsetPathNode(node, 10);
    expect(result.ok).toBe(true);
    const next = result.node;
    expect(next.kind).toBe(NODE_KIND.PATH);
    expect(next.pen).toBe(true);
    // Box = geometry + stroke padding, so the width grows by 2 * offset.
    expect(next.width).toBeCloseTo(node.width + 20, 3);
    expect(next.height).toBeCloseTo(node.height + 20, 3);
    const corners = worldPoints(next);
    expect(corners.some((p) => Math.hypot(p.x - 190, p.y - 290) < 1e-3)).toBe(true);
    expect(corners.some((p) => Math.hypot(p.x - 310, p.y - 410) < 1e-3)).toBe(true);
  });

  it("rebases the node to unit scale so baseWidth matches width", () => {
    const result = offsetPathNode(squareNode(), 4);
    expect(result.node.baseWidth).toBe(result.node.width);
    expect(result.node.baseHeight).toBe(result.node.height);
  });

  it("keeps the styling of the original node", () => {
    const node = { ...squareNode(3), fill: "#ff0000", id: "keep-me" };
    const result = offsetPathNode(node, 2);
    expect(result.node.id).toBe("keep-me");
    expect(result.node.fill).toBe("#ff0000");
    expect(result.node.strokeWidth).toBe(3);
  });

  it("refuses a rotated node instead of guessing its rotation centre", () => {
    const node = { ...squareNode(), rotation: 30 };
    expect(offsetPathNode(node, 5)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.TRANSFORMED,
    });
  });

  it("refuses a node that is not a path", () => {
    const rect = { kind: NODE_KIND.RECT, x: 0, y: 0, width: 10, height: 10 };
    expect(offsetPathNode(rect, 5)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.NOT_PATH,
    });
  });

  it("propagates the open-path refusal from the geometry", () => {
    const node = squareNode();
    const open = {
      ...node,
      points: node.points.map((p) => ({ ...p, close: false })),
    };
    expect(offsetPathNode(open, 5)).toEqual({
      ok: false,
      reason: OFFSET_FAILURE.OPEN_PATH,
    });
  });
});

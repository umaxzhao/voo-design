import { describe, expect, it } from "vitest";
import { joinPenNodes } from "../../src/canvas/editor/scene_model_paths.js";
import { fromNodeLocal } from "../../src/canvas/editor/scene_geometry.js";

// Open pen path of 100×10 base units, placed at (x, y) and rotated about its centre.
function makePath(id, x, y, extra = {}) {
  return {
    id,
    kind: "path",
    pen: true,
    x,
    y,
    rotation: 0,
    width: 100,
    height: 10,
    baseWidth: 100,
    baseHeight: 10,
    strokeWidth: 1,
    points: [
      { x: 0, y: 0, out: [30, 0] },
      { x: 100, y: 0, in: [-30, 0] },
    ],
    ...extra,
  };
}

// World-space anchors of a node, using the same transform the renderer uses.
function worldAnchors(node) {
  const sx = node.width / node.baseWidth;
  const sy = node.height / node.baseHeight;
  return node.points.map((p) => {
    const anchor = fromNodeLocal(node, { x: p.x * sx, y: p.y * sy });
    const world = (handle) => {
      if (!handle) return null;
      const end = fromNodeLocal(node, { x: p.x * sx + handle[0] * sx, y: p.y * sy + handle[1] * sy });
      return { x: end.x - anchor.x, y: end.y - anchor.y };
    };
    return { anchor, in: world(p.in), out: world(p.out) };
  });
}

function maxAnchorDrift(expected, actual) {
  let max = 0;
  for (const e of expected) {
    const nearest = Math.min(...actual.map((a) => Math.hypot(e.anchor.x - a.anchor.x, e.anchor.y - a.anchor.y)));
    max = Math.max(max, nearest);
  }
  return max;
}

describe("joinPenNodes keeps world-space geometry for transformed paths", () => {
  it.each([
    ["rotation 90", { rotation: 90 }],
    ["rotation 30", { rotation: 30 }],
    ["horizontal flip", { flipH: true }],
    ["shear", { shear: 20 }],
  ])("%s: every original anchor stays at its world position", (_name, transform) => {
    const first = makePath("first", 0, 0, transform);
    const endWorld = worldAnchors(first)[1].anchor;
    const second = makePath("second", endWorld.x - 100, endWorld.y - 0, {});
    const expected = [...worldAnchors(first), ...worldAnchors(second)];
    const joined = joinPenNodes(first, second);
    expect(joined).not.toBeNull();
    expect(maxAnchorDrift(expected, worldAnchors(joined))).toBeLessThan(1e-6);
  });

  it("keeps the rotation of the first path on the joined node", () => {
    const first = makePath("first", 0, 0, { rotation: 90 });
    const endWorld = worldAnchors(first)[1].anchor;
    const second = makePath("second", endWorld.x - 100, endWorld.y, {});
    const joined = joinPenNodes(first, second);
    expect(joined.rotation).toBe(90);
  });
});

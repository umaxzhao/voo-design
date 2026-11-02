/**
 * UF13 contract: joining open pen paths must keep every anchor at the same world
 * position, including paths that carry rotation, flip or shear. The world mapping
 * below follows applyNodeTransform (render_custom_blend.js): scale the local anchor
 * into the box, then flip, shear and rotate about the box centre.
 */
import { describe, expect, it } from "vitest";
import { joinPenNodes } from "../../src/canvas/editor/scene_model_paths.js";

const toWorldAnchor = (node, anchor) => {
  const sx = node.baseWidth ? node.width / node.baseWidth : 1;
  const sy = node.baseHeight ? node.height / node.baseHeight : 1;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  let x = node.x + anchor.x * sx;
  let y = node.y + anchor.y * sy;
  if (node.flipH) x = 2 * cx - x;
  if (node.flipV) y = 2 * cy - y;
  if (node.shear) x += Math.tan((node.shear * Math.PI) / 180) * (y - cy);
  if (node.rotation) {
    const rad = (node.rotation * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }
  return { x, y };
};

const openPath = (id, x, y, width, height, anchors, extra = {}) => ({
  id,
  kind: "path",
  name: id,
  x,
  y,
  width,
  height,
  baseWidth: width,
  baseHeight: height,
  points: anchors.map((p) => ({ x: p.x, y: p.y, in: null, out: null, close: false })),
  ...extra,
});

const worldAnchors = (node) => node.points.map((p) => toWorldAnchor(node, p));

// Chain direction may reverse during a join, so anchors are compared as a sorted set.
const sortAnchors = (points) => [...points].sort((p, q) => p.x - q.x || p.y - q.y);

const expectSameWorldAnchors = (joined, expected) => {
  const actual = sortAnchors(worldAnchors(joined));
  const wanted = sortAnchors(expected);
  expect(actual).toHaveLength(wanted.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(wanted[index].x, 6);
    expect(point.y).toBeCloseTo(wanted[index].y, 6);
  });
};

describe("joinPenNodes on transformed paths (UF13)", () => {
  it("keeps world anchors for two rotated open paths that touch at their endpoints", () => {
    const a = openPath("a", 100, 100, 80, 40, [{ x: 0, y: 0 }, { x: 80, y: 40 }], { rotation: 30 });
    const b = openPath("b", 300, 120, 60, 60, [{ x: 0, y: 0 }, { x: 60, y: 0 }], { rotation: -45 });
    // Seam: the world end of a must meet the world start of b for the join to weld.
    const endA = toWorldAnchor(a, a.points[1]);
    const startB = toWorldAnchor(b, b.points[0]);
    const movedB = { ...b, x: b.x + (endA.x - startB.x), y: b.y + (endA.y - startB.y) };

    const joined = joinPenNodes(a, movedB);
    expect(joined).not.toBeNull();
    // The touching ends weld into one anchor at their shared world position.
    const expected = [
      toWorldAnchor(a, a.points[0]),
      endA,
      toWorldAnchor(movedB, movedB.points[1]),
    ];
    expectSameWorldAnchors(joined, expected);
  });

  it("keeps world anchors for a flipped path joined to an unrotated path that does not touch", () => {
    const a = openPath("a", 50, 50, 100, 20, [{ x: 0, y: 0 }, { x: 100, y: 20 }], { flipH: true });
    const b = openPath("b", 300, 200, 40, 40, [{ x: 0, y: 0 }, { x: 40, y: 40 }]);
    const joined = joinPenNodes(a, b);
    expect(joined).not.toBeNull();
    const expected = [
      toWorldAnchor(a, a.points[0]),
      toWorldAnchor(a, a.points[1]),
      toWorldAnchor(b, b.points[0]),
      toWorldAnchor(b, b.points[1]),
    ];
    expectSameWorldAnchors(joined, expected);
  });

  it("returns an unrotated joined node so the baked anchors are not transformed twice", () => {
    const a = openPath("a", 0, 0, 40, 40, [{ x: 0, y: 0 }, { x: 40, y: 0 }], { rotation: 15 });
    const b = openPath("b", 40, 0, 40, 40, [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const joined = joinPenNodes(a, b);
    expect(joined.rotation ?? 0).toBe(0);
    expect(joined.flipH ?? false).toBe(false);
    expect(joined.flipV ?? false).toBe(false);
  });
});

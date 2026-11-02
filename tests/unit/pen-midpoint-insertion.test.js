import { describe, expect, it, vi } from "vitest";
import { createPenEdit } from "../../src/canvas/editor/editor_pen_edit.js";
import { createPenDraft } from "../../src/canvas/editor/editor_pen_draft.js";
import { cubicPoint } from "../../src/canvas/editor/editor_pen_math.js";
import { fromNodeLocal } from "../../src/canvas/editor/scene_geometry.js";

const curve = [
  { x: 0, y: 0, out: [0, 160] },
  { x: 200, y: 0, in: [0, 160] },
];
function fixture(points = curve, patch = {}, zoom = 1) {
  let doc = {
    nodes: [
      {
        id: "path",
        kind: "path",
        pen: true,
        x: 40,
        y: 50,
        width: 200,
        height: 160,
        baseWidth: 200,
        baseHeight: 160,
        points,
        ...patch,
      },
    ],
  };
  const setDoc = vi.fn((next) => {
    doc = next;
  });
  const options = {
    getDoc: () => doc,
    setDoc,
    requestRender: vi.fn(),
    getZoom: () => zoom,
  };
  const edit = createPenEdit(options);
  edit.beginEdit("path");
  const draft = createPenDraft({ ...options, getEdit: edit.getEdit });
  const world = (x, y) => {
    const node = doc.nodes[0];
    return fromNodeLocal(node, {
      x: (x * node.width) / node.baseWidth,
      y: (y * node.height) / node.baseHeight,
    });
  };
  return { edit, draft, world, node: () => doc.nodes[0], setDoc };
}

describe("fixed midpoint path insertion", () => {
  it("does not preview or insert at arbitrary positions on a curve", () => {
    const f = fixture();
    for (const t of [0.2, 0.3, 0.7, 0.8]) {
      const [x, y] = cubicPoint([0, 0], [0, 160], [200, 160], [200, 0], t);
      const point = f.world(x, y);
      f.draft.penHover(point);
      expect(f.draft.insertionPreview()).toBeNull();
      expect(f.edit.addAnchorAt(point)).toBeNull();
    }
    expect(f.node().points).toEqual(curve);
    expect(f.setDoc).not.toHaveBeenCalled();
  });

  it.each([0.5, 1, 3])(
    "uses one fixed preview at zoom %s, including transformed nodes",
    (zoom) => {
      const f = fixture(curve, { width: 400, height: 80, rotation: 30 }, zoom);
      const middle = f.world(100, 120);
      const near = { x: middle.x + 4 / zoom, y: middle.y };
      f.draft.penHover(near);
      expect(f.draft.insertionPreview()).toEqual(middle);
      expect(f.edit.addAnchorAt(near)).toBe(1);
      expect(f.node().points[1]).toMatchObject({ x: 100, y: 120 });
      expect(f.edit.getEdit().selected).toEqual([1]);
      const sample = (a, b, t) =>
        cubicPoint(
          [a.x, a.y],
          [a.x + a.out[0], a.y + a.out[1]],
          [b.x + b.in[0], b.y + b.in[1]],
          [b.x, b.y],
          t,
        );
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const [a, m, b] = f.node().points;
        const actual = t <= 0.5 ? sample(a, m, t * 2) : sample(m, b, t * 2 - 1);
        const expected = sample(curve[0], curve[1], t);
        expect(actual[0]).toBeCloseTo(expected[0], 10);
        expect(actual[1]).toBeCloseTo(expected[1], 10);
      }
    },
  );

  it("only offers the middle of a straight segment", () => {
    const f = fixture([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
    expect(f.edit.addAnchorAt(f.world(40, 0))).toBeNull();
    expect(f.edit.addAnchorAt(f.world(100, 0))).toBe(1);
    expect(f.node().points[1]).toMatchObject({ x: 100, y: 0 });
  });
  it("splits the closing segment and keeps the path closed", () => {
    const f = fixture([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 160, close: true },
    ]);
    expect(f.edit.addAnchorAt(f.world(100, 80))).toBe(3);
    expect(f.node().points).toHaveLength(4);
    expect(f.node().points[2].close).toBe(false);
    expect(f.node().points[3]).toMatchObject({ x: 100, y: 80, close: true });
  });

  it("prioritizes existing anchors over an overlapping insertion target", () => {
    const f = fixture([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]);
    f.draft.penHover(f.world(4, 0));
    expect(f.draft.insertionPreview()).toBeNull();
    expect(f.edit.addAnchorAt(f.world(4, 0))).toBeNull();
  });
  it("cancels an inserted midpoint and defers history until pointer release", () => {
    const f = fixture();
    f.edit.addAnchorAt(f.world(100, 120));
    expect(f.setDoc.mock.calls.at(-1)[1]).toEqual({ commit: false });
    f.edit.endEdit();
    expect(f.node().points).toEqual(curve);
  });
});

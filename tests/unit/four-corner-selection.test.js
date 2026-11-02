import { expect, it } from "vitest";
import { handleAtPoint, handlePoints, selectionHandlePoints, edgesOfHandle } from "../../src/canvas/editor/scene_geometry_handles.js";

const box = { x: 100, y: 80, width: 200, height: 120 };

it("exposes only four corners for plain, rotated and warped object selections", () => {
  expect(handlePoints(box).map(point => point.handle)).toEqual(["nw", "ne", "se", "sw"]);
  for (const rotation of [0, 30, 90]) {
    expect(selectionHandlePoints({ ...box, rotation })).toHaveLength(4);
  }
  expect(selectionHandlePoints({ ...box, perspectiveQuad: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }] })).toHaveLength(4);
});

it("does not capture edge midpoints as resize handles", () => {
  for (const point of [{ x: 200, y: 80 }, { x: 300, y: 140 }, { x: 200, y: 200 }, { x: 100, y: 140 }]) {
    expect(handleAtPoint(box, point, 6)).toBeNull();
  }
  expect(handleAtPoint(box, { x: 100, y: 80 }, 6)).toBe("nw");
  expect(edgesOfHandle("e").right).toBe(true);
});

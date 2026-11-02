import { expect, it } from "vitest";
import { cachedElementFor } from "../../src/canvas/editor/skia-rect-scene-cache.js";
import { documentToScene } from "../../src/canvas/editor/skia_scene_adapter.js";

const rect = { id: "rect", kind: "rect", x: 10, y: 20, width: 100, height: 80, fill: "#112233" };

it("reuses immutable rectangle mapping while invalidating geometry, paint, order and frame offsets", () => {
  const map = (node = rect, index = 0, x = 0) => cachedElementFor(node, index, x, 0);
  const first = map();
  expect(map()).toBe(first);
  expect(map({ ...rect, x: 40 }).bounds.x).toBe(40);
  expect(map({ ...rect, fill: "#445566" }).fills).not.toEqual(first.fills);
  expect(map(rect, 3).zIndex).toBe(4);
  expect(map(rect, 0, 48).bounds.x).toBe(58);
  expect(map(rect, 0, 48).bounds.y).toBe(20);
});

it("keeps grouped elements dependent on their current ancestor state", () => {
  const child = { ...rect, parentId: "group" };
  const parent = { id: "group", kind: "group", locked: false };
  expect(cachedElementFor(child, 0, 0, 0, null, { nodes: [parent, child] }).locked).toBe(false);
  expect(cachedElementFor(child, 0, 0, 0, null, { nodes: [{ ...parent, locked: true }, child] }).locked).toBe(true);
});

it("retains stable painter order and frame parenting when camera culling changes", () => {
  const doc = { id: "page", width: 500, height: 400, nodes: [rect, { ...rect, id: "next", x: 300 }] };
  const first = documentToScene(doc, {});
  const culled = documentToScene(doc, { visibleRect: { minX: 200, minY: 0, maxX: 500, maxY: 500 } });
  expect(culled.map(element => element.id)).toEqual(["frame-page", "next"]);
  expect(culled[1]).toBe(first[2]);
  expect(culled[1].parentId).toBe("frame-page");
  expect(culled[1].zIndex).toBe(2);
  expect(documentToScene({ ...doc, isCanvasRoot: true }, {})[0].parentId).toBeNull();
});

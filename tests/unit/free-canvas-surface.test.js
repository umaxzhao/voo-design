import { expect, it } from "vitest";
import { freeCanvasSurface } from "../../src/canvas/editor/workspace-free-artwork.js";

it.each([1, 0.25, 3])("keeps signed world points at the same screen position at zoom %s", zoom => {
  const page = { left: 680.4, top: 410.6 };
  const workspace = { left: 6, top: 46, right: 1446, bottom: 1046 };
  const surface = freeCanvasSurface(page, workspace, zoom);
  const point = { x: -200, y: -150 };
  expect(page.left + surface.left + surface.viewport.panX + point.x * zoom).toBeCloseTo(page.left + point.x * zoom);
  expect(page.top + surface.top + surface.viewport.panY + point.y * zoom).toBeCloseTo(page.top + point.y * zoom);
  expect(page.left + surface.left).toBeLessThanOrEqual(workspace.left);
  expect(page.left + surface.left + surface.stageWidth).toBeGreaterThanOrEqual(workspace.right);
  expect(page.top + surface.top).toBeLessThanOrEqual(workspace.top);
  expect(page.top + surface.top + surface.stageHeight).toBeGreaterThanOrEqual(workspace.bottom);
});

it("bounds raster allocation by the viewport even with distant content", () => {
  const workspace = { left: 0, top: 0, right: 1200, bottom: 800 };
  const surface = freeCanvasSurface({ left: -10000000, top: 10000000 }, workspace, 1);
  expect([surface.stageWidth, surface.stageHeight]).toEqual([1200, 800]);
});

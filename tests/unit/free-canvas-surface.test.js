import { describe, expect, it } from "vitest";
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

it("bounds raster allocation by the viewport and its one-pixel guard even with distant content", () => {
  const workspace = { left: 0, top: 0, right: 1200, bottom: 800 };
  const surface = freeCanvasSurface({ left: -10000000, top: 10000000 }, workspace, 1);
  expect([surface.stageWidth, surface.stageHeight]).toEqual([1201, 801]);
});

describe("camera-independent free canvas backing dimensions", () => {
  it("keeps one allocation size while fractional artboard origins move", () => {
    const workspace = { left: 10, right: 1010, top: 20, bottom: 820 };
    const surfaces = Array.from({ length: 21 }, (_, i) =>
      freeCanvasSurface({ left: 200 + i / 10, top: -50 + i / 10 }, workspace, .75));
    expect(new Set(surfaces.map(surface => surface.stageWidth)).size).toBe(1);
    expect(new Set(surfaces.map(surface => surface.stageHeight)).size).toBe(1);
    surfaces.forEach((surface, i) => {
      const pageLeft = 200 + i / 10, pageTop = -50 + i / 10;
      expect(pageLeft + surface.left).toBeLessThanOrEqual(workspace.left);
      expect(pageLeft + surface.left + surface.stageWidth).toBeGreaterThanOrEqual(workspace.right);
      expect(pageTop + surface.top).toBeLessThanOrEqual(workspace.top);
      expect(pageTop + surface.top + surface.stageHeight).toBeGreaterThanOrEqual(workspace.bottom);
      expect(surface.viewport).toEqual({ zoom: .75, panX: -surface.left, panY: -surface.top });
    });
  });
});

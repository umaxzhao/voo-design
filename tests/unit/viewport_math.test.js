import { describe, it, expect } from "vitest";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";

describe("Viewport Math & Coordinate Projections", () => {
  it("converts screen/client coordinates to document coordinates reversibly", () => {
    const mockStage = {
      clientWidth: 1000,
      clientHeight: 800,
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 1000,
        height: 800,
      }),
    };

    const doc = { width: 800, height: 600, nodes: [] };

    const vp = createViewport({
      stage: mockStage,
      getDoc: () => doc,
      notify: () => {},
      requestRender: () => {},
    });

    // Initial state: zoom = 1, panX = 0, panY = 0
    expect(vp.getZoom()).toBe(1);

    // Test toDocPoint
    // Client (100, 50) is stage origin (0, 0)
    const p0 = vp.toDocPoint(100, 50);
    expect(p0.x).toBe(0);
    expect(p0.y).toBe(0);

    // Client (200, 150) -> Stage (100, 100) -> Doc (100, 100) at zoom 1, pan 0
    const p1 = vp.toDocPoint(200, 150);
    expect(p1.x).toBe(100);
    expect(p1.y).toBe(100);

    // Apply pan: dx = 50, dy = 30
    vp.panBy(50, 30);
    expect(vp.getViewport().panX).toBe(50);
    expect(vp.getViewport().panY).toBe(30);

    // Client (200, 150) -> Stage (100, 100) -> Doc (100 - 50, 100 - 30) = (50, 70)
    const p2 = vp.toDocPoint(200, 150);
    expect(p2.x).toBe(50);
    expect(p2.y).toBe(70);
  });

  it("zoomAt preserves the document point under the cursor (fixed-point invariant)", () => {
    const mockStage = {
      clientWidth: 1000,
      clientHeight: 800,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
      }),
    };

    const doc = { width: 800, height: 600, nodes: [] };
    const vp = createViewport({
      stage: mockStage,
      getDoc: () => doc,
      notify: () => {},
      requestRender: () => {},
    });

    // Center cursor at stage coordinates (400, 300)
    const stagePoint = { x: 400, y: 300 };
    const beforeDocPoint = vp.toDocPoint(stagePoint.x, stagePoint.y);

    // Zoom in by factor 1.5
    vp.zoomAt(1.5, stagePoint);

    const afterDocPoint = vp.toDocPoint(stagePoint.x, stagePoint.y);
    expect(Math.abs(afterDocPoint.x - beforeDocPoint.x)).toBeLessThan(1e-6);
    expect(Math.abs(afterDocPoint.y - beforeDocPoint.y)).toBeLessThan(1e-6);

    // Zoom out by factor 0.5
    vp.zoomAt(0.5, stagePoint);
    const afterZoomOutDocPoint = vp.toDocPoint(stagePoint.x, stagePoint.y);
    expect(Math.abs(afterZoomOutDocPoint.x - beforeDocPoint.x)).toBeLessThan(1e-6);
    expect(Math.abs(afterZoomOutDocPoint.y - beforeDocPoint.y)).toBeLessThan(1e-6);
  });

  it("zoomToHundred resets zoom to 1.0 centered on stage", () => {
    const mockStage = {
      clientWidth: 1000,
      clientHeight: 800,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    };

    const doc = { width: 400, height: 300, nodes: [] };
    const vp = createViewport({
      stage: mockStage,
      getDoc: () => doc,
      notify: () => {},
      requestRender: () => {},
    });

    vp.zoomAt(3.0, { x: 100, y: 100 });
    expect(vp.getZoom()).toBe(3.0);

    vp.zoomToHundred();
    expect(vp.getZoom()).toBe(1.0);
  });
});

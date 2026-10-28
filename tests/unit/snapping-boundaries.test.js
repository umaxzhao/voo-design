import { describe, it, expect } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { createTestDoc } from "./snapping-doc.js";

describe("Scene Snapping - Tier 2: Boundary Cases", () => {
  const doc = createTestDoc([
    { id: "node-1", visible: true, x: 0, y: 0, width: 100, height: 100 },
  ]);

  it("returns rect completely unmodified when options.enabled is false", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 3.45, y: 4.89, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: false, snapToGrid: true, snapToObjects: true },
    });
    expect(res.x).toBe(3.45);
    expect(res.y).toBe(4.89);
    expect(res.deltaX).toBe(0);
    expect(res.deltaY).toBe(0);
    expect(res.guides.length).toBe(0);
  });

  it("ignores grid when options.snapToGrid is false but snapToObjects is true", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 103, y: 200, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToGrid: false, snapToObjects: true, grid: { size: 10 } },
    });
    // node-1 right edge is 100. Near 103 -> snaps to 100, not to grid line 100
    expect(res.x).toBe(100);
  });

  it("ignores sibling objects when options.snapToObjects is false", () => {
    const res = snapNodeBounds({
      doc,
      rect: { x: 103, y: 200, width: 50, height: 50 },
      zoom: 1,
      options: { enabled: true, snapToGrid: false, snapToObjects: false },
    });
    expect(res.x).toBe(103);
  });

  it("handles negative coordinates in negative canvas quadrants", () => {
    const docWithNeg = createTestDoc([
      { id: "neg-1", visible: true, x: -200, y: -200, width: 100, height: 100 },
    ]);
    const res = snapNodeBounds({
      doc: docWithNeg,
      rect: { x: -103, y: -200, width: 50, height: 50 },
      zoom: 1,
    });
    // neg-1 right edge is -100. Near -103 -> snaps to -100
    expect(res.x).toBe(-100);
  });

  it("handles empty document (doc.nodes = []) without throwing errors", () => {
    const emptyDoc = createTestDoc([]);
    const res = snapNodeBounds({
      doc: emptyDoc,
      rect: { x: 50, y: 50, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res).toBeDefined();
    expect(res.x).toBe(50);
  });

  it("excludes all activeIds in multi-selection to prevent self-snapping lock", () => {
    const multiDoc = createTestDoc([
      { id: "sel-1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "sel-2", visible: true, x: 200, y: 100, width: 50, height: 50 },
      { id: "other", visible: true, x: 500, y: 100, width: 50, height: 50 },
    ]);

    const res = snapNodeBounds({
      doc: multiDoc,
      activeIds: ["sel-1", "sel-2"],
      rect: { x: 102, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    // Should NOT snap to sel-1 (which is at 100) because sel-1 is in activeIds
    expect(res.x).toBe(102);
  });

  it("prefers nearest snap target when multiple candidate edges fall within threshold window", () => {
    const closeDoc = createTestDoc([
      { id: "c1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "c2", visible: true, x: 104, y: 100, width: 50, height: 50 },
    ]);

    // Dragging near 101: distance to c1(100) is 1, distance to c2(104) is 3 -> snaps to c1(100)
    const res = snapNodeBounds({
      doc: closeDoc,
      rect: { x: 101, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.x).toBe(100);
  });
});

// ============================================================================
// TIER 3: Pairwise Combinations (Flags x Handles)
// ============================================================================

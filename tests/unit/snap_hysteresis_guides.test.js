import { describe, expect, it } from "vitest";
import {
  SNAP_ACQUIRE_PX,
  SNAP_RELEASE_PX,
  buildSnapOptions,
  snapNodeBounds,
} from "../../src/canvas/editor/scene_snapping.js";
import { drawGuides } from "../../src/canvas/editor/chrome_stage_overlays.js";

describe("snap hysteresis and segment guides", () => {
  const doc = {
    width: 1000,
    height: 800,
    nodes: [
      { id: "peer", visible: true, x: 100, y: 100, width: 80, height: 80 },
    ],
  };

  it("exports acquire/release thresholds and forwards activeSnap in options", () => {
    expect(SNAP_ACQUIRE_PX).toBe(5);
    expect(SNAP_RELEASE_PX).toBe(9);
    expect(buildSnapOptions({ activeSnap: true }).activeSnap).toBe(true);
    expect(buildSnapOptions({}).activeSnap).toBe(false);
  });

  it("acquires a sibling edge snap inside the acquire threshold", () => {
    // peer top = 100; drag at y=104 → 4px < acquire(5)
    const snap = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 300, y: 104, width: 60, height: 60 },
      zoom: 1,
      options: { activeSnap: false },
    });
    expect(snap.y).toBe(100);
    const guide = snap.guides.find((g) => g.type === "h" && g.pos === 100);
    expect(guide).toBeTruthy();
    expect(guide.startX).toBeDefined();
    expect(guide.endX).toBeDefined();
    expect(guide.startX).toBeLessThan(guide.endX);
  });

  it("does not acquire just outside the acquire threshold", () => {
    // Tiny height so only the top edge can engage peer.top=100.
    // 7px away: above acquire(5), below release(9)
    const snap = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 400, y: 107, width: 60, height: 10 },
      zoom: 1,
      options: { activeSnap: false },
    });
    expect(snap.y).toBe(107);
  });

  it("keeps an active snap inside the release threshold (hysteresis)", () => {
    // Same 7px distance, but already snapped — release is 9px
    const snap = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 400, y: 107, width: 60, height: 10 },
      zoom: 1,
      options: { activeSnap: true },
    });
    expect(snap.y).toBe(100);
  });

  it("releases an active snap beyond the release threshold", () => {
    const snap = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 400, y: 112, width: 60, height: 10 },
      zoom: 1,
      options: { activeSnap: true },
    });
    expect(snap.y).toBe(112);
  });

  it("drawGuides uses segment endpoints when present", () => {
    const moves = [];
    const ctx = {
      canvas: { width: 1000, height: 800 },
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      stroke: () => {},
      setLineDash: () => {},
      moveTo: (x, y) => moves.push(["move", x, y]),
      lineTo: (x, y) => moves.push(["line", x, y]),
      strokeStyle: "",
      lineWidth: 1,
    };
    drawGuides(
      ctx,
      [{ type: "v", pos: 100, startY: 50, endY: 150 }],
      { zoom: 1, panX: 0, panY: 0 },
      1,
    );
    expect(moves).toEqual([
      ["move", 100.5, 50],
      ["line", 100.5, 150],
    ]);
  });
});

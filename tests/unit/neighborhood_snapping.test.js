import { describe, expect, it } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { buildSpatialIndex } from "../../src/canvas/editor/viewport_culling.js";

function gridDoc(count, step = 80) {
  const cols = Math.ceil(Math.sqrt(count));
  return {
    width: 10000,
    height: 10000,
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      visible: true,
      kind: "rect",
      x: (i % cols) * step,
      y: Math.floor(i / cols) * step,
      width: 40,
      height: 40,
    })),
  };
}

describe("neighborhood snapping", () => {
  it("still snaps to a nearby sibling when the document is dense", () => {
    const doc = gridDoc(400);
    // Place the drag next to n0 at (0,0) so the right edge aligns at x=40.
    const res = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 42, y: 0, width: 40, height: 40 },
      zoom: 1,
      options: { neighborhoodMargin: 200 },
    });
    expect(res.x).toBe(40);
  });

  it("ignores far-away siblings outside the neighborhood margin", () => {
    const doc = {
      width: 5000,
      height: 5000,
      nodes: [
        { id: "near", visible: true, x: 100, y: 100, width: 50, height: 50 },
        { id: "far", visible: true, x: 4000, y: 100, width: 50, height: 50 },
      ],
    };
    // Drag sits next to "near". "far" shares the same y but is thousands of
    // pixels away — a full scan would still offer its edges as targets.
    const res = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 152, y: 100, width: 50, height: 50 },
      zoom: 1,
      options: { neighborhoodMargin: 80 },
    });
    expect(res.x).toBe(150);
    expect(res.guides.every((guide) => guide.pos !== 4000 && guide.pos !== 4050)).toBe(
      true,
    );
  });

  it("uses a spatial index when provided", () => {
    const doc = gridDoc(800);
    const spatialIndex = buildSpatialIndex(doc.nodes);
    const near = doc.nodes[0];
    const res = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: near.x + near.width + 2, y: near.y, width: 40, height: 40 },
      zoom: 1,
      options: { spatialIndex, neighborhoodMargin: 300 },
    });
    expect(res.x).toBe(near.x + near.width);
  });

  it("keeps equidistant gap snaps inside the neighborhood", () => {
    const doc = {
      width: 2000,
      height: 800,
      nodes: [
        { id: "a", visible: true, x: 100, y: 100, width: 100, height: 80 },
        { id: "b", visible: true, x: 260, y: 100, width: 100, height: 80 },
        { id: "noise", visible: true, x: 1800, y: 100, width: 100, height: 80 },
      ],
    };
    const res = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: 423, y: 100, width: 100, height: 80 },
      zoom: 1,
      options: { neighborhoodMargin: 500 },
    });
    expect(res.x).toBe(420);
    const gaps = res.guides.filter((guide) => guide.type === "gap_h");
    expect(gaps.some((guide) => guide.gap === 60)).toBe(true);
  });
});

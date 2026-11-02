import { describe, it, expect } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";

describe("scene_snapping (Figma & Affinity Smart Alignment & Equidistant Snapping)", () => {
  const sampleDoc = {
    width: 1000,
    height: 800,
    nodes: [
      { id: "node-1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "node-2", visible: true, x: 250, y: 100, width: 100, height: 100 }, // gap between node-1 and node-2 is 50px (250 - 200)
    ],
  };

  it("snaps to canvas boundaries (left, center, right)", () => {
    // Near left edge (x: 4 -> snaps to 0)
    const snapLeft = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: 4, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapLeft.x).toBe(0);
    expect(snapLeft.guides.some((g) => g.type === "v" && g.pos === 0)).toBe(true);

    // Near canvas center (width is 1000, center is 500. Box center: 462 + 40 = 502 -> snaps center to 500)
    const snapCenter = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: 462, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapCenter.x).toBe(460); // 460 + 40 = 500
    expect(snapCenter.guides.some((g) => g.type === "v" && g.pos === 500)).toBe(true);
  });

  it("snaps to sibling node edges and centers", () => {
    // node-1 top is 100. Dragging node near y: 103 -> snaps to 100
    const snapEdge = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: 500, y: 103, width: 60, height: 60 },
      zoom: 1,
    });
    expect(snapEdge.y).toBe(100);
    expect(snapEdge.guides.some((g) => g.type === "h" && g.pos === 100)).toBe(true);
  });

  it("performs equidistant horizontal gap snapping", () => {
    // node-1 is [100, 200], node-2 is [250, 350]. Gap is 50px.
    // An element of width 80 placed to the right of node-2 with same gap: 350 + 50 = 400.
    // If rect.x is 403, it should snap to 400!
    const snapGapRight = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: 403, y: 500, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapGapRight.x).toBe(400);
    expect(snapGapRight.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);

    // Placed to the left of node-1 with same gap: 100 - 50 - 80 = -30.
    // If rect.x is -28, it should snap to -30!
    const snapGapLeft = snapNodeBounds({
      doc: sampleDoc,
      activeId: "active",
      rect: { x: -28, y: 500, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapGapLeft.x).toBe(-30);
  });

  it("performs equidistant vertical gap snapping", () => {
    const docWithVNodes = {
      width: 1000,
      height: 1200,
      nodes: [
        { id: "v-1", visible: true, x: 200, y: 100, width: 100, height: 100 },
        { id: "v-2", visible: true, x: 200, y: 260, width: 100, height: 100 }, // gap is 60px (260 - 200)
      ],
    };

    // Third element placed below v-2 with 60px gap: 360 + 60 = 420.
    // If rect.y is 422, it snaps to 420!
    const snapGapBelow = snapNodeBounds({
      doc: docWithVNodes,
      activeId: "active",
      rect: { x: 500, y: 422, width: 80, height: 80 },
      zoom: 1,
    });
    expect(snapGapBelow.y).toBe(420);
    expect(snapGapBelow.guides.some((g) => g.type === "h" && g.pos === 420)).toBe(true);
  });
});

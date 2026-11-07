import { describe, it, expect } from "vitest";
import { computeAltDistanceGuides } from "../../src/canvas/editor/alt_distance_guides.js";

describe("Alt distance measurement guides (Figma parity)", () => {
  it("calculates horizontal separation between two sibling nodes", () => {
    const nodeA = { id: "a", x: 100, y: 100, width: 80, height: 60 };
    const nodeB = { id: "b", x: 220, y: 100, width: 80, height: 60 };

    const guides = computeAltDistanceGuides(nodeA, nodeB);
    expect(guides).toHaveLength(1);
    expect(guides[0].type).toBe("gap_h");
    expect(guides[0].label).toBe("40"); // 220 - (100 + 80) = 40
    expect(guides[0].x1).toBe(180);
    expect(guides[0].x2).toBe(220);
  });

  it("calculates vertical separation between two sibling nodes", () => {
    const nodeA = { id: "a", x: 100, y: 50, width: 80, height: 50 };
    const nodeB = { id: "b", x: 100, y: 150, width: 80, height: 50 };

    const guides = computeAltDistanceGuides(nodeA, nodeB);
    expect(guides).toHaveLength(1);
    expect(guides[0].type).toBe("gap_v");
    expect(guides[0].label).toBe("50"); // 150 - (50 + 50) = 50
    expect(guides[0].y1).toBe(100);
    expect(guides[0].y2).toBe(150);
  });

  it("calculates 4 inner padding distances when node is nested inside frame", () => {
    const frame = { id: "frame", x: 0, y: 0, width: 400, height: 300 };
    const child = { id: "child", x: 50, y: 40, width: 100, height: 60, parentId: "frame" };

    const guides = computeAltDistanceGuides(child, frame);
    expect(guides.length).toBeGreaterThanOrEqual(4);
    const top = guides.find((g) => g.type === "gap_v" && g.y1 === 0);
    const left = guides.find((g) => g.type === "gap_h" && g.x1 === 0);
    expect(top?.label).toBe("40");
    expect(left?.label).toBe("50");
  });

  it("returns empty array when measuring against self or missing node", () => {
    const node = { id: "a", x: 0, y: 0, width: 10, height: 10 };
    expect(computeAltDistanceGuides(node, node)).toEqual([]);
    expect(computeAltDistanceGuides(null, node)).toEqual([]);
  });
});

import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import {
  drawGuides,
  SPACING_GUIDE_COLOR,
} from "../../src/canvas/editor/chrome_stage_overlays.js";

describe("smart_spacing_snapping — Equidistant Gap Snapping & Visual Overlay Guides", () => {
  // Test Document Setup
  // Two horizontal cards: card-1 at [100, 200] (w=100), card-2 at [260, 360] (w=100)
  // Gap between card-1 and card-2 = 260 - (100 + 100) = 60px
  const horizontalDoc = {
    width: 1200,
    height: 800,
    nodes: [
      { id: "c1", visible: true, x: 100, y: 150, width: 100, height: 80 },
      { id: "c2", visible: true, x: 260, y: 150, width: 100, height: 80 },
    ],
  };

  // Two vertical cards: v1 at [150, 100] (h=100), v2 at [150, 280] (h=100)
  // Gap between v1 and v2 = 280 - (100 + 100) = 80px
  const verticalDoc = {
    width: 800,
    height: 1200,
    nodes: [
      { id: "v1", visible: true, x: 150, y: 100, width: 90, height: 100 },
      { id: "v2", visible: true, x: 150, y: 280, width: 90, height: 100 },
    ],
  };

  describe("Tier 1: Horizontal Gap Snapping", () => {
    it("snaps to horizontal append right position with matching gap", () => {
      // Existing gap: 60px between c1 [100..200] and c2 [260..360]
      // Append right target: 360 + 60 = 420
      // Dragging a 100x80 card near x=423 (within 6px threshold)
      const res = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 423, y: 150, width: 100, height: 80 },
        zoom: 1,
      });

      expect(res.x).toBe(420);
      expect(res.deltaX).toBe(420 - 423);

      // Verify backward-compatible guideline
      expect(res.guides.some((g) => g.type === "v" && g.pos === 420)).toBe(true);

      // Verify rich gap guide descriptors
      const gapGuides = res.guides.filter((g) => g.type === "gap_h");
      expect(gapGuides.length).toBeGreaterThanOrEqual(2);

      // First gap: between c1 and c2
      const firstGap = gapGuides.find((g) => g.x1 === 200 && g.x2 === 260);
      expect(firstGap).toBeDefined();
      expect(firstGap.gap).toBe(60);
      expect(firstGap.label).toBe("60px");

      // Second gap: between c2 and dragged item
      const secondGap = gapGuides.find((g) => g.x1 === 360 && g.x2 === 420);
      expect(secondGap).toBeDefined();
      expect(secondGap.gap).toBe(60);
      expect(secondGap.label).toBe("60px");
    });

    it("snaps to horizontal append left position with matching gap", () => {
      // 2 nodes: n1 at [250..350], n2 at [410..510] -> gap = 60px
      // Append left target: 250 - 60 - width(80) = 110
      // Dragging a 80x80 card near x=112 (center = 152, not near canvas center or edge)
      const testDoc = {
        width: 1200,
        height: 800,
        nodes: [
          { id: "n1", visible: true, x: 250, y: 150, width: 100, height: 80 },
          { id: "n2", visible: true, x: 410, y: 150, width: 100, height: 80 },
        ],
      };

      const res = snapNodeBounds({
        doc: testDoc,
        activeId: "active",
        rect: { x: 112, y: 150, width: 80, height: 80 },
        zoom: 1,
      });

      expect(res.x).toBe(110);
      // Guide marks the gap boundary at dragged item's right edge: 110 + 80 = 190 (or n1.x - gap = 250 - 60 = 190)
      expect(
        res.guides.some((g) => g.type === "v" && (g.pos === 110 || g.pos === 190)),
      ).toBe(true);

      const gapGuides = res.guides.filter((g) => g.type === "gap_h");
      expect(gapGuides.length).toBeGreaterThanOrEqual(2);
      expect(gapGuides.some((g) => g.gap === 60 && g.label === "60px")).toBe(true);
    });

    it("snaps to horizontal in-between insertion position (centered between two peers)", () => {
      // Sibling 1: x = [100..200], Sibling 2: x = [500..600]
      // Free space between them: 500 - 200 = 300px
      // Dragging a rect with width 100 between them:
      // Remaining space: 300 - 100 = 200px
      // Equidistant gap: 200 / 2 = 100px
      // Target centered position: 200 + 100 = 300
      const wideDoc = {
        width: 1200,
        height: 800,
        nodes: [
          { id: "left", visible: true, x: 100, y: 200, width: 100, height: 100 },
          { id: "right", visible: true, x: 500, y: 200, width: 100, height: 100 },
        ],
      };

      // Dragging card near x=303 (within 6px threshold of 300)
      const res = snapNodeBounds({
        doc: wideDoc,
        activeId: "mid",
        rect: { x: 303, y: 200, width: 100, height: 100 },
        zoom: 1,
      });

      expect(res.x).toBe(300);
      expect(res.guides.some((g) => g.type === "v" && g.pos === 300)).toBe(true);

      const gapGuides = res.guides.filter((g) => g.type === "gap_h");
      expect(gapGuides.length).toBe(2);

      // Gap 1: from left node right edge (200) to dragged node left edge (300)
      expect(gapGuides[0].x1).toBe(200);
      expect(gapGuides[0].x2).toBe(300);
      expect(gapGuides[0].gap).toBe(100);
      expect(gapGuides[0].label).toBe("100px");

      // Gap 2: from dragged node right edge (400) to right node left edge (500)
      expect(gapGuides[1].x1).toBe(400);
      expect(gapGuides[1].x2).toBe(500);
      expect(gapGuides[1].gap).toBe(100);
      expect(gapGuides[1].label).toBe("100px");
    });
  });

  describe("Tier 1: Vertical Gap Snapping", () => {
    it("snaps to vertical append below position with matching gap", () => {
      // Existing gap: 80px between v1 [100..200] and v2 [280..380]
      // Append below target: 380 + 80 = 460
      // Dragging near y=462
      const res = snapNodeBounds({
        doc: verticalDoc,
        activeId: "active",
        rect: { x: 150, y: 462, width: 90, height: 80 },
        zoom: 1,
      });

      expect(res.y).toBe(460);
      expect(res.guides.some((g) => g.type === "h" && g.pos === 460)).toBe(true);

      const gapGuides = res.guides.filter((g) => g.type === "gap_v");
      expect(gapGuides.length).toBeGreaterThanOrEqual(2);

      // Gap between v1 and v2
      const firstGap = gapGuides.find((g) => g.y1 === 200 && g.y2 === 280);
      expect(firstGap).toBeDefined();
      expect(firstGap.gap).toBe(80);
      expect(firstGap.label).toBe("80px");

      // Gap between v2 and dragged item
      const secondGap = gapGuides.find((g) => g.y1 === 380 && g.y2 === 460);
      expect(secondGap).toBeDefined();
      expect(secondGap.gap).toBe(80);
      expect(secondGap.label).toBe("80px");
    });

    it("snaps to vertical append above position with matching gap", () => {
      // Existing gap: 80px between v1 [100..200] and v2 [280..380]
      // Append above target: 100 - 80 - height(60) = -40
      // Dragging near y=-38
      const res = snapNodeBounds({
        doc: verticalDoc,
        activeId: "active",
        rect: { x: 150, y: -38, width: 90, height: 60 },
        zoom: 1,
      });

      expect(res.y).toBe(-40);
      // Guide marks the gap boundary at dragged item's bottom edge: -40 + 60 = 20 (or v1.y - gap)
      expect(
        res.guides.some((g) => g.type === "h" && (g.pos === -40 || g.pos === 20)),
      ).toBe(true);

      const gapGuides = res.guides.filter((g) => g.type === "gap_v");
      expect(gapGuides.length).toBeGreaterThanOrEqual(2);
      expect(gapGuides.some((g) => g.gap === 80 && g.label === "80px")).toBe(true);
    });

    it("snaps to vertical in-between insertion position (centered between two peers)", () => {
      // Top node: y = [50..150] (h=100)
      // Bottom node: y = [450..550] (h=100)
      // Free space: 450 - 150 = 300px
      // Dragging rect with height 60:
      // Remaining space: 300 - 60 = 240px
      // Gap: 240 / 2 = 120px
      // Target position: 150 + 120 = 270
      const tallDoc = {
        width: 800,
        height: 1000,
        nodes: [
          { id: "top", visible: true, x: 100, y: 50, width: 100, height: 100 },
          { id: "bottom", visible: true, x: 100, y: 450, width: 100, height: 100 },
        ],
      };

      // Dragging near y=272 (within 6px threshold of 270)
      const res = snapNodeBounds({
        doc: tallDoc,
        activeId: "mid",
        rect: { x: 100, y: 272, width: 100, height: 60 },
        zoom: 1,
      });

      expect(res.y).toBe(270);
      expect(res.guides.some((g) => g.type === "h" && g.pos === 270)).toBe(true);

      const gapGuides = res.guides.filter((g) => g.type === "gap_v");
      expect(gapGuides.length).toBe(2);
      expect(gapGuides[0].y1).toBe(150);
      expect(gapGuides[0].y2).toBe(270);
      expect(gapGuides[0].gap).toBe(120);
      expect(gapGuides[0].label).toBe("120px");

      expect(gapGuides[1].y1).toBe(330); // 270 + 60
      expect(gapGuides[1].y2).toBe(450);
      expect(gapGuides[1].gap).toBe(120);
      expect(gapGuides[1].label).toBe("120px");
    });
  });

  describe("Tier 2: Boundary Value Analysis & Bypass Conditions", () => {
    it("bypasses gap snapping when snapEqualSpacing option is explicitly disabled", () => {
      // Near append right target 420 (rect.x = 423)
      const res = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 423, y: 150, width: 100, height: 80 },
        zoom: 1,
        options: { snapEqualSpacing: false },
      });

      // Does not snap to 420 gap
      expect(res.x).toBe(423);
      expect(res.guides.some((g) => g.type === "gap_h")).toBe(false);
    });

    it("bypasses all snapping when options.enabled is false", () => {
      const res = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 423, y: 150, width: 100, height: 80 },
        zoom: 1,
        options: { enabled: false },
      });

      expect(res.x).toBe(423);
      expect(res.y).toBe(150);
      expect(res.guides).toEqual([]);
    });

    it("does not snap when distance exceeds threshold tolerance", () => {
      // Target is 420. Dragging at x=430 (diff=10px > default threshold 6px)
      const res = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 430, y: 150, width: 100, height: 80 },
        zoom: 1,
      });

      expect(res.x).toBe(430);
      expect(res.guides.some((g) => g.type === "gap_h")).toBe(false);
    });

    it("rejects small gap jitter when gap is less than or equal to 4px", () => {
      // Nodes spaced by 3px: node1 [0..50], node2 [53..103] -> gap = 3px
      const jitterDoc = {
        width: 1000,
        height: 600,
        nodes: [
          { id: "j1", visible: true, x: 0, y: 100, width: 50, height: 50 },
          { id: "j2", visible: true, x: 53, y: 100, width: 50, height: 50 },
        ],
      };

      // Target right would be 103 + 3 = 106
      const res = snapNodeBounds({
        doc: jitterDoc,
        activeId: "active",
        rect: { x: 105, y: 100, width: 50, height: 50 },
        zoom: 1,
      });

      // Gap <= 4 must be ignored for gap snapping (anti-jitter rule)
      expect(res.guides.some((g) => g.type === "gap_h")).toBe(false);
    });

    it("ignores hidden nodes (visible === false) when computing gap references", () => {
      const docWithHidden = {
        width: 1000,
        height: 600,
        nodes: [
          { id: "h1", visible: false, x: 100, y: 100, width: 100, height: 100 },
          { id: "h2", visible: true, x: 300, y: 100, width: 100, height: 100 },
        ],
      };

      const res = snapNodeBounds({
        doc: docWithHidden,
        activeId: "active",
        rect: { x: 498, y: 100, width: 100, height: 100 },
        zoom: 1,
      });

      // Only 1 visible sibling exists -> cannot form sibling gap pairs
      expect(res.guides.some((g) => g.type === "gap_h")).toBe(false);
    });

    it("excludes activeIds from stationary candidate boxes during multi-drag", () => {
      // If dragging c1 and c2 together, they cannot snap against each other
      const res = snapNodeBounds({
        doc: horizontalDoc,
        activeIds: ["c1", "c2"],
        rect: { x: 423, y: 150, width: 260, height: 80 },
        zoom: 1,
      });

      expect(res.guides.some((g) => g.type === "gap_h")).toBe(false);
    });
  });

  describe("Tier 3: Proximity Filtering & Zoom Adaptivity", () => {
    it("scales threshold inversely with zoom", () => {
      // At zoom = 2, threshold = max(3, 6 / 2) = 3px
      // Dragging at x = 424 (dist = 4px > 3px) -> should NOT snap at zoom=2
      const resZoom2 = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 424, y: 150, width: 100, height: 80 },
        zoom: 2,
      });
      expect(resZoom2.x).toBe(424);

      // At zoom = 0.5, threshold = max(3, 6 / 0.5) = 12px
      // Dragging at x = 428 (dist = 8px <= 12px) -> should snap to 420 at zoom=0.5
      const resZoomHalf = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 428, y: 150, width: 100, height: 80 },
        zoom: 0.5,
      });
      expect(resZoomHalf.x).toBe(420);
    });
  });

  describe("Tier 3: Overlay Drawing Pipeline Execution", () => {
    it("exports SPACING_GUIDE_COLOR with compliant vibrant magenta token #e056fd", () => {
      expect(SPACING_GUIDE_COLOR).toBe("#e056fd");
    });

    it("executes drawGuides with mock Canvas2D context without runtime errors", () => {
      // Generate realistic guides from snapNodeBounds
      const snapResult = snapNodeBounds({
        doc: horizontalDoc,
        activeId: "active",
        rect: { x: 422, y: 150, width: 100, height: 80 },
        zoom: 1,
      });

      expect(snapResult.guides.length).toBeGreaterThan(0);

      // Mock CanvasRenderingContext2D
      const mockCanvas = { width: 1200, height: 800 };
      const mockCtx = {
        canvas: mockCanvas,
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        roundRect: vi.fn(),
        closePath: vi.fn(),
        quadraticCurveTo: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 28 })),
        setLineDash: vi.fn(),
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 1,
        font: "",
        textAlign: "",
        textBaseline: "",
      };

      const viewport = { zoom: 1, panX: 0, panY: 0 };
      const dpr = 1;

      // Must execute cleanly without throwing
      expect(() => {
        drawGuides(mockCtx, snapResult.guides, viewport, dpr);
      }).not.toThrow();

      // Verify Canvas2D interactions occurred
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it("handles empty or null guides gracefully in drawGuides", () => {
      const mockCtx = { canvas: { width: 800, height: 600 } };
      expect(() => drawGuides(mockCtx, [], { zoom: 1, panX: 0, panY: 0 }, 1)).not.toThrow();
      expect(() => drawGuides(mockCtx, null, { zoom: 1, panX: 0, panY: 0 }, 1)).not.toThrow();
    });
  });

  describe("Tier 4: Real-World Scenarios", () => {
    it("Scenario 2: Card Grid Insertion — dragging new card between two cards in a row", () => {
      // Card 1: [100..300], Card 2: [700..900]
      // Space between: 400px
      // Inserting Card 3 of width 200:
      // (400 - 200) / 2 = 100px gap on each side
      // Snap position: 300 + 100 = 400
      const gridDoc = {
        width: 1920,
        height: 1080,
        nodes: [
          { id: "col-1", visible: true, x: 100, y: 100, width: 200, height: 250 },
          { id: "col-2", visible: true, x: 700, y: 100, width: 200, height: 250 },
        ],
      };

      const snap = snapNodeBounds({
        doc: gridDoc,
        activeId: "dragged-col",
        rect: { x: 398, y: 100, width: 200, height: 250 },
        zoom: 1,
      });

      expect(snap.x).toBe(400);

      const hGaps = snap.guides.filter((g) => g.type === "gap_h");
      expect(hGaps.length).toBe(2);
      expect(hGaps[0].gap).toBe(100);
      expect(hGaps[1].gap).toBe(100);
    });
  });
});

import { describe, it, expect } from "vitest";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { createTestDoc } from "./snapping-doc.js";

describe("scene_snapping Module Baseline & Availability", () => {
  it("exports snapNodeBounds function", () => {
    expect(typeof snapNodeBounds).toBe("function");
  });

  it("returns input rect structure when given minimal parameters", () => {
    const res = snapNodeBounds({
      doc: createTestDoc(),
      rect: { x: 50, y: 50, width: 100, height: 100 },
    });
    expect(res).toBeDefined();
    expect(Number.isFinite(res.x)).toBe(true);
    expect(Number.isFinite(res.y)).toBe(true);
    expect(Number.isFinite(res.width)).toBe(true);
    expect(Number.isFinite(res.height)).toBe(true);
    expect(Array.isArray(res.guides)).toBe(true);
  });
});

// ============================================================================
// TIER 1: Feature Tests (Primary Happy Paths, ≥5 per feature)
// ============================================================================
describe("Scene Snapping - Tier 1: Baseline Canvas & Sibling Alignment", () => {
  const doc = createTestDoc([
    { id: "node-1", visible: true, x: 100, y: 100, width: 100, height: 100 },
    { id: "node-2", visible: true, x: 400, y: 100, width: 100, height: 100 },
  ]);

  it("snaps to canvas boundary (left edge at x = 0)", () => {
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 4, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(0);
    expect(res.guides.some((g) => g.type === "v" && g.pos === 0)).toBe(true);
  });

  it("snaps to canvas center (x = doc.width / 2)", () => {
    // Canvas width is 1000, center is 500. Box center: 462 + 40 = 502 -> snaps to 500
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 462, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(460); // 460 + 40 = 500
    expect(res.guides.some((g) => g.type === "v" && g.pos === 500)).toBe(true);
  });

  it("snaps to sibling node top edge (y = 100)", () => {
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 250, y: 103, width: 60, height: 60 },
      zoom: 1,
    });
    expect(res.y).toBe(100);
    expect(res.guides.some((g) => g.type === "h" && g.pos === 100)).toBe(true);
  });

  it("snaps to sibling node center line", () => {
    // node-1 horizontal center is 100 + 50 = 150. Dragging box with center at 153 -> snaps to 150
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 123, y: 400, width: 60, height: 60 }, // center is 123 + 30 = 153
      zoom: 1,
    });
    expect(res.x).toBe(120); // 120 + 30 = 150
    expect(res.guides.some((g) => g.type === "v" && g.pos === 150)).toBe(true);
  });

  it("snaps during resize handle drag (East handle snaps right edge)", () => {
    // East handle resizing right edge near node-2 right edge (500)
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 250, y: 300, width: 247, height: 60 }, // right edge is 497 -> near 500
      zoom: 1,
      handle: "e",
    });
    expect(res.width).toBe(250); // 250 + 250 = 500
    expect(res.x).toBe(250); // x remains fixed during East handle drag
  });
});

describe("Scene Snapping - Tier 1: In-Between Equal Spacing Snapping", () => {
  it("snaps moving element with horizontal equal gap between sibling cards", () => {
    // node-1 is [100, 200], node-2 is [250, 350]. Gap is 50px.
    // Placing 80px element to right of node-2 with same 50px gap: 350 + 50 = 400.
    const doc = createTestDoc([
      { id: "n1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "n2", visible: true, x: 250, y: 100, width: 100, height: 100 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 403, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(400);
    expect(res.guides.some((g) => g.type === "v" && g.pos === 400)).toBe(true);
  });

  it("snaps moving element with horizontal equal gap to the left of sibling cards", () => {
    const doc = createTestDoc([
      { id: "n1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "n2", visible: true, x: 250, y: 100, width: 100, height: 100 },
    ]);

    // Left of n1 with 50px gap: 100 - 50 - 80 = -30
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: -28, y: 300, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(-30);
  });

  it("snaps moving element with vertical equal gap below sibling elements", () => {
    // v-1 is [100, 200], v-2 is [260, 360]. Gap is 60px.
    // Below v-2 with 60px gap: 360 + 60 = 420.
    const doc = createTestDoc([
      { id: "v1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "v2", visible: true, x: 100, y: 260, width: 100, height: 100 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 100, y: 422, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.y).toBe(420);
    expect(res.guides.some((g) => g.type === "h" && g.pos === 420)).toBe(true);
  });

  it("snaps moving element with vertical equal gap above sibling elements", () => {
    const doc = createTestDoc([
      { id: "v1", visible: true, x: 100, y: 100, width: 100, height: 100 },
      { id: "v2", visible: true, x: 100, y: 260, width: 100, height: 100 },
    ]);

    // Above v-1 with 60px gap: 100 - 60 - 80 = -40
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 100, y: -38, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.y).toBe(-40);
  });

  it("ignores minuscule gaps <= 4px for equidistant snapping to avoid jitter", () => {
    const doc = createTestDoc([
      { id: "g1", visible: true, x: 100, y: 100, width: 50, height: 50 },
      { id: "g2", visible: true, x: 152, y: 100, width: 50, height: 50 }, // gap is only 2px
    ]);

    // Right of g2 with 2px gap would be 202 + 2 = 204.
    // At x: 215 (outside 6px edge threshold of 202), equidistant snapping should NOT generate a guide at 204
    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 215, y: 300, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.guides.some((g) => g.pos === 204)).toBe(false);
  });
});

describe("Scene Snapping - Tier 1: Tolerance & Zoom Scaling", () => {
  it("scales document snap threshold inversely with zoom (zoom = 2 halves document threshold)", () => {
    const doc = createTestDoc();
    // At zoom = 1, threshold is 6px. Point at x = 5 snaps to 0.
    const res1 = snapNodeBounds({
      doc,
      rect: { x: 5, y: 100, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res1.x).toBe(0);

    // At zoom = 2, threshold is 3px. Point at x = 5 is beyond 3px threshold, so does NOT snap to 0!
    const res2 = snapNodeBounds({
      doc,
      rect: { x: 5, y: 100, width: 50, height: 50 },
      zoom: 2,
    });
    expect(res2.x).toBe(5);
  });

  it("scales document snap threshold inversely with zoom (zoom = 0.5 doubles document threshold to 12px)", () => {
    const doc = createTestDoc();
    // At zoom = 0.5, threshold is 12px. Point at x = 10 snaps to 0.
    const res = snapNodeBounds({
      doc,
      rect: { x: 10, y: 100, width: 50, height: 50 },
      zoom: 0.5,
    });
    expect(res.x).toBe(0);
  });

  it("enforces minimum clamp on snap threshold (never collapses below 3px at high zoom)", () => {
    const doc = createTestDoc();
    // At zoom = 100, 6 / 100 = 0.06px, but clamped to Math.max(3, ...). Point at x = 2 snaps to 0.
    const res = snapNodeBounds({
      doc,
      rect: { x: 2, y: 100, width: 50, height: 50 },
      zoom: 100,
    });
    expect(res.x).toBe(0);
  });

  it("snaps to user persistent guide lines from doc.guides", () => {
    const doc = createTestDoc([], [
      { type: "v", pos: 120 },
      { type: "h", pos: 240 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "active",
      rect: { x: 122, y: 238, width: 50, height: 50 },
      zoom: 1,
    });
    expect(res.x).toBe(120);
    expect(res.y).toBe(240);
  });

  it("resizes from North-West handle ('nw') adjusting both x, y and width, height simultaneously", () => {
    const doc = createTestDoc();
    const res = snapNodeBounds({
      doc,
      rect: { x: 4, y: 3, width: 100, height: 100 },
      zoom: 1,
      handle: "nw",
    });
    expect(res.x).toBe(0);
    expect(res.y).toBe(0);
    expect(res.width).toBe(104);
    expect(res.height).toBe(103);
  });
});

// ============================================================================
// TIER 1: Milestone 3 Grid & Pixel Snapping Features
// ============================================================================
describe("Scene Snapping - Tier 4: Real-World Scenarios", () => {
  it("Scenario 1: Responsive Dashboard 3-Column Card Layout (Equidistant Horizontal Gap)", () => {
    // 3 cards in a row. Card 1 at x=100 (w=200). Card 2 at x=340 (w=200). Gap = 40px.
    // Placing Card 3 near x=583 (w=200) -> should snap to x=580 with equal 40px gap!
    const doc = createTestDoc([
      { id: "card-1", visible: true, x: 100, y: 150, width: 200, height: 120 },
      { id: "card-2", visible: true, x: 340, y: 150, width: 200, height: 120 },
    ]);

    const res = snapNodeBounds({
      doc,
      activeId: "card-3",
      rect: { x: 583, y: 150, width: 200, height: 120 },
      zoom: 1,
    });
    expect(res.x).toBe(580);
    expect(res.y).toBe(150);
  });

  it("Scenario 2: Technical Isometric Blueprint Component Snapping", () => {
    const doc = createTestDoc();
    const res = snapNodeBounds({
      doc,
      rect: { x: 61, y: 36, width: 60, height: 60 },
      zoom: 1,
      options: { enabled: true, snapToGrid: true, grid: { type: "isometric", size: 30 } },
    });
    expect(Number.isFinite(res.x)).toBe(true);
    expect(Number.isFinite(res.y)).toBe(true);
  });

  it("Scenario 3: Pixel-Perfect Mobile Icon Grid (24x24 Icons)", () => {
    const doc = createTestDoc();
    const res = snapNodeBounds({
      doc,
      rect: { x: 23.85, y: 47.92, width: 24, height: 24 },
      zoom: 1,
      options: { enabled: true, snapToPixel: true },
    });
    expect(res.x).toBe(24);
    expect(res.y).toBe(48);
    expect(res.width).toBe(24);
    expect(res.height).toBe(24);
  });

  it("Scenario 4: User Guide Alignment & Margin Snapping", () => {
    const doc = createTestDoc(
      [{ id: "banner", visible: true, x: 120, y: 200, width: 400, height: 150 }],
      [{ type: "v", pos: 120 }, { type: "h", pos: 200 }],
    );

    const res = snapNodeBounds({
      doc,
      activeId: "logo",
      rect: { x: 122, y: 198, width: 80, height: 80 },
      zoom: 1,
    });
    expect(res.x).toBe(120);
    expect(res.y).toBe(200);
  });

  it("Scenario 5: Multi-Selection Batch Translation without Self-Snapping Lock", () => {
    const doc = createTestDoc([
      { id: "m1", visible: true, x: 100, y: 100, width: 80, height: 80 },
      { id: "m2", visible: true, x: 200, y: 100, width: 80, height: 80 },
      { id: "m3", visible: true, x: 300, y: 100, width: 80, height: 80 },
      { id: "stationary", visible: true, x: 600, y: 100, width: 80, height: 80 },
    ]);

    // Dragging m1, m2, m3 as a group. Moving bounding box placed near stationary node (600)
    const res = snapNodeBounds({
      doc,
      activeIds: ["m1", "m2", "m3"],
      rect: { x: 518, y: 100, width: 80, height: 80 }, // right edge is 598 -> snaps to stationary left edge (600)
      zoom: 1,
    });
    expect(res.x).toBe(520); // 520 + 80 = 600
  });
});

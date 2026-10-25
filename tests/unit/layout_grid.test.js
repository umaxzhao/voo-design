// Layout grids: normalised model, pure geometry, and the stage overlay pass.
import { describe, expect, it, vi } from "vitest";
import {
  LAYOUT_GRID_TYPES,
  gridColour,
  layoutGridGeometry,
  normalizeLayoutGrid,
} from "../../src/canvas/editor/layout_grid.js";
import { drawLayoutGrids } from "../../src/canvas/editor/chrome_layout_grid.js";

const box = { x: 100, y: 50, width: 240, height: 160 };

describe("layout grid model", () => {
  it("normalises unknown fields and keeps old {enabled,size} docs working", () => {
    expect(normalizeLayoutGrid({ enabled: true, size: 8 })).toMatchObject({
      enabled: true,
      type: "grid",
      size: 8,
      count: 12,
      gutter: 16,
      margin: 16,
    });
    expect(normalizeLayoutGrid({ enabled: true, type: "columns" }).type).toBe("columns");
    expect(normalizeLayoutGrid({ enabled: true, type: "nope" }).type).toBe("grid");
    expect(LAYOUT_GRID_TYPES).toEqual(["grid", "columns", "rows"]);
  });

  it("clamps counts, gutters and margins", () => {
    const grid = normalizeLayoutGrid({
      enabled: true,
      type: "columns",
      count: 999,
      gutter: -4,
      margin: 9999,
    });
    expect(grid.count).toBe(64);
    expect(grid.gutter).toBe(0);
    expect(grid.margin).toBe(512);
  });

  it("renders rgba() from the grid colour", () => {
    expect(gridColour("#FF3B30", 0.1)).toBe("rgba(255, 59, 48, 0.1)");
  });
});

describe("layout grid geometry", () => {
  it("builds a pixel grid every size pixels", () => {
    const geometry = layoutGridGeometry(box, { enabled: true, type: "grid", size: 40 });
    expect(geometry.lines.length).toBe(5 + 3); // interior vertical + horizontal lines
    expect(geometry.lines[0]).toEqual([140, 50, 140, 210]);
  });

  it("splits columns with margin and gutter", () => {
    const geometry = layoutGridGeometry(box, {
      enabled: true,
      type: "columns",
      count: 4,
      gutter: 10,
      margin: 20,
    });
    expect(geometry.bands).toHaveLength(4);
    // (240 - 40 - 30) / 4 = 42.5 wide bands
    expect(geometry.bands[0]).toMatchObject({ x: 120, y: 50, width: 42.5, height: 160 });
    expect(geometry.bands[1].x).toBeCloseTo(172.5);
  });

  it("creates row bands and hides when disabled", () => {
    const rows = layoutGridGeometry(box, {
      enabled: true,
      type: "rows",
      count: 3,
      gutter: 0,
      margin: 10,
    });
    expect(rows.bands).toHaveLength(3);
    expect(rows.bands[0]).toMatchObject({ x: 100, y: 60, width: 240 });
    expect(layoutGridGeometry(box, { enabled: false, type: "rows" }).bands).toEqual([]);
  });
});

describe("layout grid overlay", () => {
  const doc = {
    nodes: [
      { id: "frame", x: 0, y: 0, width: 200, height: 100, layoutGrid: { enabled: true, type: "grid", size: 20 } },
      { id: "off", x: 0, y: 0, width: 200, height: 100, layoutGrid: { enabled: false } },
      { id: "hidden", x: 0, y: 0, width: 200, height: 100, visible: false, layoutGrid: { enabled: true } },
    ],
  };
  const context = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillRect: vi.fn(),
    stroke: vi.fn(),
    set fillStyle(value) {},
    set strokeStyle(value) {},
    set lineWidth(value) { this._lineWidth = value; },
    get lineWidth() { return this._lineWidth; },
  });

  it("draws only enabled, visible grids", () => {
    const ctx = context();
    drawLayoutGrids(ctx, doc, { zoom: 1 });
    expect(ctx.clip).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("draws column bands as filled rects", () => {
    const ctx = context();
    drawLayoutGrids(
      ctx,
      {
        nodes: [
          { id: "f", x: 0, y: 0, width: 200, height: 100, layoutGrid: { enabled: true, type: "columns", count: 2, gutter: 0, margin: 0 } },
        ],
      },
      { zoom: 2 },
    );
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect.mock.calls[0]).toEqual([0, 0, 100, 100]);
  });
});

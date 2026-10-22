import { describe, it, expect } from "vitest";
import {
  CULL_MARGIN_WORLD_PX,
  cullableNodeIds,
  isBoxOffscreen,
  visibleWorldRect,
  buildSpatialIndex,
  visibleNodeIds,
} from "../../src/canvas/editor/viewport_culling.js";

const VIEW = { panX: 0, panY: 0, zoom: 1 };

describe("visibleWorldRect", () => {
  it("maps the screen into world space at zoom 1 with the margin", () => {
    const rect = visibleWorldRect(VIEW, 800, 600, 0);
    expect(rect).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 });
  });

  it("accounts for pan and zoom", () => {
    const rect = visibleWorldRect({ panX: -200, panY: 100, zoom: 2 }, 800, 600, 0);
    expect(rect.minX).toBe(100);
    expect(rect.minY).toBe(-50);
    expect(rect.maxX).toBe(500);
    expect(rect.maxY).toBe(250);
  });

  it("grows by the default margin on every side", () => {
    const rect = visibleWorldRect(VIEW, 800, 600);
    expect(rect.minX).toBe(-CULL_MARGIN_WORLD_PX);
    expect(rect.maxY).toBe(600 + CULL_MARGIN_WORLD_PX);
  });
});

describe("isBoxOffscreen", () => {
  const visible = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("keeps boxes that overlap the rectangle", () => {
    expect(isBoxOffscreen({ x: 50, y: 50, width: 10, height: 10 }, visible)).toBe(false);
  });

  it("drops boxes entirely to one side", () => {
    expect(isBoxOffscreen({ x: 200, y: 0, width: 10, height: 10 }, visible)).toBe(true);
    expect(isBoxOffscreen({ x: 0, y: -50, width: 10, height: 10 }, visible)).toBe(true);
  });

  it("keeps a box that only touches the edge", () => {
    expect(isBoxOffscreen({ x: 100, y: 0, width: 10, height: 10 }, visible)).toBe(false);
    expect(isBoxOffscreen({ x: -10, y: 0, width: 10, height: 10 }, visible)).toBe(false);
  });
});

describe("cullableNodeIds", () => {
  it("includes plain self-contained nodes", () => {
    const doc = { nodes: [{ id: "a", kind: "rect" }, { id: "b", kind: "image" }] };
    expect([...cullableNodeIds(doc)].sort()).toEqual(["a", "b"]);
  });

  it("never culls adjustment, boolean or group nodes", () => {
    const doc = {
      nodes: [
        { id: "adj", kind: "adjustment" },
        { id: "bool", kind: "boolean" },
        { id: "grp", kind: "group" },
        { id: "plain", kind: "rect" },
      ],
    };
    expect([...cullableNodeIds(doc)]).toEqual(["plain"]);
  });

  it("keeps a clip base and its clipped layers out of culling", () => {
    const doc = {
      nodes: [
        { id: "base", kind: "image" },
        { id: "mask", kind: "rect", clipTo: "base" },
        { id: "other", kind: "rect" },
      ],
    };
    expect([...cullableNodeIds(doc)]).toEqual(["other"]);
  });

  it("keeps nodes with effects, since their paint extends past the box", () => {
    const doc = {
      nodes: [{ id: "shadowed", kind: "rect", effects: [{ type: "shadow" }] }],
    };
    expect(cullableNodeIds(doc).size).toBe(0);
  });
});

describe("visibleNodeIds with SpatialIndex", () => {
  it("filters out-of-frustum cullable nodes while preserving visible ones", () => {
    const doc = {
      nodes: [
        { id: "visible-1", kind: "rect", x: 50, y: 50, width: 50, height: 50 },
        { id: "visible-2", kind: "image", x: 150, y: 150, width: 100, height: 100 },
        { id: "offscreen-far", kind: "rect", x: 2000, y: 2000, width: 50, height: 50 },
      ],
    };
    const spatialIndex = buildSpatialIndex(doc.nodes);
    expect(spatialIndex.size).toBe(3);

    const visibleRect = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    const visible = visibleNodeIds(doc, visibleRect, spatialIndex);

    expect(visible.has("visible-1")).toBe(true);
    expect(visible.has("visible-2")).toBe(true);
    expect(visible.has("offscreen-far")).toBe(false);
  });

  it("always preserves non-cullable nodes even if their bounds are outside visible rect", () => {
    const doc = {
      nodes: [
        { id: "adj", kind: "adjustment", x: 3000, y: 3000, width: 100, height: 100 },
        { id: "shadowed", kind: "rect", x: 4000, y: 4000, width: 50, height: 50, effects: [{ type: "shadow" }] },
        { id: "plain-offscreen", kind: "rect", x: 5000, y: 5000, width: 50, height: 50 },
      ],
    };
    const spatialIndex = buildSpatialIndex(doc.nodes);
    const visibleRect = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    const visible = visibleNodeIds(doc, visibleRect, spatialIndex);

    expect(visible.has("adj")).toBe(true);
    expect(visible.has("shadowed")).toBe(true);
    expect(visible.has("plain-offscreen")).toBe(false);
  });

  it("returns all node IDs when visibleRect is null", () => {
    const doc = {
      nodes: [
        { id: "a", kind: "rect", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", kind: "rect", x: 500, y: 500, width: 10, height: 10 },
      ],
    };
    const visible = visibleNodeIds(doc, null);
    expect(visible.size).toBe(2);
    expect(visible.has("a")).toBe(true);
    expect(visible.has("b")).toBe(true);
  });
});

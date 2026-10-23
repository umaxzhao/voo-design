/**
 * M4 performance gate: 1,000+ node frustum culling, neighborhood snapping,
 * and byte-budgeted LRU eviction under load.
 */
import { describe, expect, it } from "vitest";
import {
  buildSpatialIndex,
  visibleNodeIds,
} from "../../src/canvas/editor/viewport_culling.js";
import { snapNodeBounds } from "../../src/canvas/editor/scene_snapping.js";
import { createBitmapCache } from "../../src/canvas/editor/bitmap_cache.js";

function makeRect(id, x, y, w = 40, h = 40) {
  return {
    id,
    kind: "rect",
    visible: true,
    x,
    y,
    width: w,
    height: h,
  };
}

describe("M4 performance gate", () => {
  it("culls a 2,000-node document to the viewport in under 25ms", () => {
    const nodes = [];
    for (let i = 0; i < 2000; i += 1) {
      const col = i % 50;
      const row = Math.floor(i / 50);
      nodes.push(makeRect(`n${i}`, col * 120, row * 120));
    }
    const doc = { width: 20000, height: 20000, nodes };
    const index = buildSpatialIndex(nodes);
    const visibleRect = { minX: 0, minY: 0, maxX: 800, maxY: 600 };

    const t0 = performance.now();
    const visible = visibleNodeIds(doc, visibleRect, index);
    const elapsed = performance.now() - t0;

    expect(visible.size).toBeGreaterThan(10);
    expect(visible.size).toBeLessThan(nodes.length);
    expect(elapsed).toBeLessThan(25);
  });

  it("neighborhood snaps among 1,200 peers without scanning the whole document", () => {
    const nodes = [];
    for (let i = 0; i < 1200; i += 1) {
      nodes.push(makeRect(`p${i}`, (i % 40) * 80, Math.floor(i / 40) * 80));
    }
    const doc = { width: 50000, height: 50000, nodes };
    const spatialIndex = buildSpatialIndex(nodes);
    const near = nodes[0];

    const t0 = performance.now();
    const result = snapNodeBounds({
      doc,
      activeId: "drag",
      rect: { x: near.x + near.width + 2, y: near.y, width: 40, height: 40 },
      zoom: 1,
      options: { spatialIndex, neighborhoodMargin: 300 },
    });
    const elapsed = performance.now() - t0;

    expect(result.x).toBe(near.x + near.width);
    expect(elapsed).toBeLessThan(40);
  });

  it("byte-budgeted LRU evicts the oldest unpinned images under load", () => {
    const evicted = [];
    const cache = createBitmapCache({
      maxEntries: 64,
      maxBytes: 40 * 400, // 40 images × 400 bytes
      onEvict: (image) => evicted.push(image),
    });

    for (let i = 0; i < 80; i += 1) {
      cache.put(
        { imageId: `img-${i}` },
        { width: 10, height: 10, naturalWidth: 10, naturalHeight: 10 },
      );
    }

    const stats = cache.stats();
    expect(stats.size).toBeLessThanOrEqual(40);
    expect(stats.totalBytes).toBeLessThanOrEqual(40 * 400);
    expect(evicted.length).toBeGreaterThanOrEqual(40);
  });
});

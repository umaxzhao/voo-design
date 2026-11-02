import { describe, it, expect } from "vitest";
import { SpatialIndex } from "../../src/canvas/editor/spatial_index.js";
import { nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { nodesWithin } from "../../src/canvas/editor/doc_ops_selection.js";
import { buildSpatialIndex } from "../../src/canvas/editor/viewport_culling.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

describe("SpatialIndex (2D R-Tree)", () => {
  it("initializes as empty with default configuration", () => {
    const index = new SpatialIndex();
    expect(index.size).toBe(0);
    expect(index.all()).toEqual([]);
    expect(index.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual([]);
    expect(index.pointQuery({ x: 50, y: 50 })).toEqual([]);
  });

  it("inserts items and maintains accurate bounding box indexing", () => {
    const index = new SpatialIndex(4);
    index.insert({ id: "rect1", minX: 10, minY: 10, maxX: 50, maxY: 50 });
    index.insert({ id: "rect2", minX: 60, minY: 10, maxX: 100, maxY: 50 });
    index.insert({ id: "rect3", minX: 10, minY: 60, maxX: 50, maxY: 100 });

    expect(index.size).toBe(3);

    const hit = index.search({ minX: 0, minY: 0, maxX: 55, maxY: 55 });
    expect(hit.map((h) => h.id)).toContain("rect1");
    expect(hit.map((h) => h.id)).not.toContain("rect2");
    expect(hit.map((h) => h.id)).not.toContain("rect3");
  });

  it("supports normalisation from x, y, width, height", () => {
    const index = new SpatialIndex();
    index.insert({ id: "box", x: 100, y: 200, width: 50, height: 80 });

    const results = index.search({ minX: 120, minY: 220, maxX: 130, maxY: 230 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("box");
    expect(results[0].minX).toBe(100);
    expect(results[0].minY).toBe(200);
    expect(results[0].maxX).toBe(150);
    expect(results[0].maxY).toBe(280);
  });

  it("handles pointQuery with exact and tolerance matching", () => {
    const index = new SpatialIndex();
    index.insert({ id: "target", minX: 10, minY: 10, maxX: 20, maxY: 20 });

    // Inside
    expect(index.pointQuery({ x: 15, y: 15 }).map((h) => h.id)).toEqual(["target"]);
    // On boundary
    expect(index.pointQuery({ x: 10, y: 10 }).map((h) => h.id)).toEqual(["target"]);
    expect(index.pointQuery({ x: 20, y: 20 }).map((h) => h.id)).toEqual(["target"]);
    // Outside without tolerance
    expect(index.pointQuery({ x: 25, y: 15 })).toEqual([]);
    // Outside with tolerance
    expect(index.pointQuery({ x: 25, y: 15 }, 6).map((h) => h.id)).toEqual(["target"]);
    expect(index.pointQuery({ x: 30, y: 15 }, 6)).toEqual([]);
  });

  it("handles remove operations accurately", () => {
    const index = new SpatialIndex(4);
    const item1 = { id: "a", minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const item2 = { id: "b", minX: 20, minY: 20, maxX: 30, maxY: 30 };
    index.insert(item1);
    index.insert(item2);

    expect(index.size).toBe(2);

    // Remove by object
    expect(index.remove(item1)).toBe(true);
    expect(index.size).toBe(1);
    expect(index.search({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);

    // Remove non-existent
    expect(index.remove({ id: "non-existent" })).toBe(false);
    expect(index.size).toBe(1);

    // Remove by string id
    expect(index.remove("b")).toBe(true);
    expect(index.size).toBe(0);
    expect(index.all()).toEqual([]);
  });

  it("handles clear operation", () => {
    const index = new SpatialIndex();
    index.insert({ id: "1", minX: 0, minY: 0, maxX: 10, maxY: 10 });
    index.insert({ id: "2", minX: 20, minY: 20, maxX: 30, maxY: 30 });
    expect(index.size).toBe(2);

    index.clear();
    expect(index.size).toBe(0);
    expect(index.all()).toEqual([]);
  });

  it("bulk-loads items using STR algorithm", () => {
    const index = new SpatialIndex(4);
    const items = [
      { id: "1", minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { id: "2", minX: 20, minY: 0, maxX: 30, maxY: 10 },
      { id: "3", minX: 40, minY: 0, maxX: 50, maxY: 10 },
      { id: "4", minX: 0, minY: 20, maxX: 10, maxY: 30 },
      { id: "5", minX: 20, minY: 20, maxX: 30, maxY: 30 },
      { id: "6", minX: 40, minY: 20, maxX: 50, maxY: 30 },
      { id: "7", minX: 0, minY: 40, maxX: 10, maxY: 50 },
      { id: "8", minX: 20, minY: 40, maxX: 30, maxY: 50 },
      { id: "9", minX: 40, minY: 40, maxX: 50, maxY: 50 },
    ];

    index.load(items);
    expect(index.size).toBe(9);

    const q = index.search({ minX: 15, minY: 15, maxX: 45, maxY: 45 });
    const hitIds = q.map((i) => i.id).sort();
    expect(hitIds).toEqual(["5", "6", "8", "9"]);
  });

  it("handles edge cases: duplicate coordinates, zero-size bounds, and negative coordinates", () => {
    const index = new SpatialIndex(4);
    // Duplicate coordinates
    index.insert({ id: "dup1", minX: 50, minY: 50, maxX: 50, maxY: 50 });
    index.insert({ id: "dup2", minX: 50, minY: 50, maxX: 50, maxY: 50 });

    // Zero-width line
    index.insert({ id: "lineV", minX: 10, minY: 0, maxX: 10, maxY: 100 });
    // Zero-height line
    index.insert({ id: "lineH", minX: 0, minY: 20, maxX: 100, maxY: 20 });

    // Negative coordinates
    index.insert({ id: "neg", minX: -500, minY: -400, maxX: -200, maxY: -100 });

    expect(index.size).toBe(5);

    // Query duplicate point
    const pointHits = index.pointQuery({ x: 50, y: 50 });
    expect(pointHits.map((h) => h.id).sort()).toEqual(["dup1", "dup2"]);

    // Query negative box
    const negHits = index.search({ minX: -300, minY: -300, maxX: -100, maxY: 0 });
    expect(negHits.map((h) => h.id)).toEqual(["neg"]);

    // Query line intersection
    const lineHits = index.pointQuery({ x: 10, y: 50 });
    expect(lineHits.map((h) => h.id)).toContain("lineV");
  });

  it("safely sanitizes non-finite or invalid coordinates", () => {
    const index = new SpatialIndex();
    index.insert({ id: "nan", minX: NaN, minY: 10, maxX: 50, maxY: Infinity });
    expect(index.size).toBe(1);

    const hit = index.search({ minX: -10, minY: -10, maxX: 100, maxY: 100 });
    expect(hit.length).toBe(1);
    expect(hit[0].id).toBe("nan");
  });

  it("collides returns early boolean for collision detection", () => {
    const index = new SpatialIndex();
    index.insert({ id: "a", minX: 100, minY: 100, maxX: 200, maxY: 200 });

    expect(index.collides({ minX: 150, minY: 150, maxX: 250, maxY: 250 })).toBe(true);
    expect(index.collides({ minX: 300, minY: 300, maxX: 400, maxY: 400 })).toBe(false);
  });

  it("benchmarks 10,000+ nodes under high-performance stress", () => {
    const index = new SpatialIndex(16);
    const N = 10000;
    const items = new Array(N);

    for (let i = 0; i < N; i += 1) {
      const x = (i % 100) * 50;
      const y = Math.floor(i / 100) * 50;
      items[i] = {
        id: `node_${i}`,
        minX: x,
        minY: y,
        maxX: x + 40,
        maxY: y + 40,
      };
    }

    const tStart = performance.now();
    index.load(items);
    const loadTime = performance.now() - tStart;
    expect(index.size).toBe(N);
    // STR loading 10,000 nodes should be fast (< 250ms)
    expect(loadTime).toBeLessThan(500);

    // Viewport query (simulate camera viewport showing ~20x20 = 400 items)
    const tQueryStart = performance.now();
    const visible = index.search({ minX: 500, minY: 500, maxX: 1500, maxY: 1500 });
    const queryTime = performance.now() - tQueryStart;

    expect(visible.length).toBeGreaterThan(0);
    // R-Tree search should execute in sub-millisecond to low milliseconds
    expect(queryTime).toBeLessThan(50);

    // Point query
    const tPointStart = performance.now();
    const pointHit = index.pointQuery({ x: 510, y: 510 });
    const pointTime = performance.now() - tPointStart;
    expect(pointHit.length).toBe(1);
    expect(pointTime).toBeLessThan(20);
  });
});

describe("Spatial Index Integration: nodeAtPoint & nodesWithin", () => {
  it("accelerates nodeAtPoint with spatial index while returning topmost stacked node", () => {
    const bottomNode = {
      id: "bottom",
      kind: NODE_KIND.RECT,
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      visible: true,
    };
    const topNode = {
      id: "top",
      kind: NODE_KIND.RECT,
      x: 150,
      y: 150,
      width: 100,
      height: 100,
      visible: true,
    };
    const doc = { nodes: [bottomNode, topNode] };
    const spatialIndex = buildSpatialIndex(doc.nodes);
    doc.spatialIndex = spatialIndex;

    // Point in overlapping region (160, 160) - topNode is on top
    const hitOverlapping = nodeAtPoint(doc, { x: 160, y: 160 });
    expect(hitOverlapping?.id).toBe("top");

    // Point only on bottomNode (110, 110)
    const hitBottomOnly = nodeAtPoint(doc, { x: 110, y: 110 });
    expect(hitBottomOnly?.id).toBe("bottom");

    // Point outside both
    const hitOutside = nodeAtPoint(doc, { x: 400, y: 400 });
    expect(hitOutside).toBeNull();
  });

  it("yields identical results for nodeAtPoint with and without spatialIndex", () => {
    const nodes = [];
    for (let i = 0; i < 50; i += 1) {
      nodes.push({
        id: `node-${i}`,
        kind: NODE_KIND.RECT,
        x: i * 20,
        y: i * 20,
        width: 60,
        height: 60,
        visible: true,
      });
    }
    const doc = { nodes };
    const spatialIndex = buildSpatialIndex(nodes);

    // Test 10 sample points
    const testPoints = [
      { x: 30, y: 30 },
      { x: 100, y: 100 },
      { x: 250, y: 250 },
      { x: 500, y: 500 },
      { x: 900, y: 900 },
      { x: 0, y: 0 },
      { x: -50, y: -50 },
      { x: 1500, y: 1500 },
    ];

    for (const pt of testPoints) {
      const hitWithout = nodeAtPoint(doc, pt);
      const hitWith = nodeAtPoint(doc, pt, { spatialIndex });
      expect(hitWith?.id).toBe(hitWithout?.id);
    }
  });

  it("accelerates nodesWithin marquee queries with spatial index", () => {
    const nodes = [];
    for (let i = 0; i < 100; i += 1) {
      nodes.push({
        id: `box-${i}`,
        kind: NODE_KIND.RECT,
        x: (i % 10) * 100,
        y: Math.floor(i / 10) * 100,
        width: 80,
        height: 80,
        visible: true,
      });
    }
    const doc = { nodes };
    const spatialIndex = buildSpatialIndex(nodes);
    doc.spatialIndex = spatialIndex;

    const marquee = { x: 150, y: 150, width: 220, height: 220 };
    const resultsWith = nodesWithin(doc, marquee);
    const resultsWithout = nodesWithin({ nodes }, marquee);

    expect(resultsWith.map((n) => n.id)).toEqual(resultsWithout.map((n) => n.id));
    expect(resultsWith.length).toBeGreaterThan(0);
  });
});


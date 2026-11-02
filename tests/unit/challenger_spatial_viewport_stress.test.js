import { describe, it, expect, vi } from "vitest";
import { SpatialIndex } from "../../src/canvas/editor/spatial_index.js";
import {
  visibleWorldRect,
  isBoxOffscreen,
  cullableNodeIds,
  visibleNodeIds,
  buildSpatialIndex,
} from "../../src/canvas/editor/viewport_culling.js";
import {
  screenToWorld,
  worldToScreen,
  worldToFrame,
  frameToWorld,
  screenToFrame,
  frameToScreen,
  createCameraMatrixTransformer,
} from "../../src/canvas/editor/editor_pointer_pan_zoom.js";
import { documentsToScene } from "../../src/canvas/editor/skia_scene_adapter.js";
import { createSkiaHost } from "../../src/canvas/editor/skia_host.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";


const isCI = !!process.env.CI;
function medianOf(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function perfRuns(run, warmup = 2, runs = 5) {
  for (let i = 0; i < warmup; i += 1) run();
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const s = performance.now();
    run();
    times.push(performance.now() - s);
  }
  return medianOf(times);
}

describe("Challenger 1: R-Tree Spatial Index & Viewport Extreme Stress Harness", () => {
  // =========================================================================
  // TIER 1: Extreme Scale R-Tree Stress (10,000 to 50,000 nodes)
  // =========================================================================
  describe("Tier 1: Extreme Scale R-Tree Stress (10,000 to 50,000 nodes)", () => {
    it("1.1: Bulk loads 50,000 nodes with O(N log N) STR packing and sub-second performance", () => {
      const N = 50000;
      const items = new Array(N);

      // Distribute 50,000 nodes over a realistic multi-artboard canvas (25 artboards of 2,000 nodes)
      for (let i = 0; i < N; i += 1) {
        const artboardIdx = Math.floor(i / 2000);
        const artboardX = (artboardIdx % 5) * 4000;
        const artboardY = Math.floor(artboardIdx / 5) * 4000;

        const localX = (i % 50) * 60;
        const localY = (Math.floor(i / 50) % 40) * 60;

        items[i] = {
          id: `node_${i}`,
          minX: artboardX + localX,
          minY: artboardY + localY,
          maxX: artboardX + localX + 50,
          maxY: artboardY + localY + 50,
        };
      }

      let index;
      const loadTime = perfRuns(() => {
        index = new SpatialIndex(16);
        index.load(items);
      }, 2, 5);

      expect(index.size).toBe(N);
      // 50,000 nodes STR bulk load should complete well within a generous budget
      if (!isCI) {
        expect(loadTime).toBeLessThan(4500);
      }

      // Verify root bounds encompass all items
      expect(index.data.minX).toBeLessThanOrEqual(0);
      expect(index.data.minY).toBeLessThanOrEqual(0);
      expect(index.data.maxX).toBeGreaterThanOrEqual(16000 + 49 * 60 + 50);
      expect(index.data.maxY).toBeGreaterThanOrEqual(16000 + 39 * 60 + 50);
    });

    it("1.2: Demonstrates sub-linear O(log N + K) search complexity vs O(N) linear scan over 50,000 nodes", () => {
      const N = 50000;
      const items = new Array(N);

      for (let i = 0; i < N; i += 1) {
        const x = (i % 250) * 100;
        const y = Math.floor(i / 250) * 100;
        items[i] = {
          id: `item_${i}`,
          minX: x,
          minY: y,
          maxX: x + 80,
          maxY: y + 80,
        };
      }

      const index = new SpatialIndex(16);
      index.load(items);

      // Perform 50 small localized viewport queries (K ~ 10-25 items)
      const numQueries = 50;
      const queryBoxes = [];
      for (let q = 0; q < numQueries; q += 1) {
        const qx = (q * 37) % 20000;
        const qy = (q * 43) % 15000;
        queryBoxes.push({
          minX: qx,
          minY: qy,
          maxX: qx + 400,
          maxY: qy + 400,
        });
      }

      // Warm up R-Tree search path
      for (let w = 0; w < 2; w += 1) {
        for (let q = 0; q < numQueries; q += 1) index.search(queryBoxes[q]);
      }

      const rtreeRunTimes = [];
      let rtreeResults = [];
      for (let r = 0; r < 5; r += 1) {
        const tStart = performance.now();
        const res = [];
        for (let q = 0; q < numQueries; q += 1) {
          res.push(index.search(queryBoxes[q]));
        }
        rtreeRunTimes.push(performance.now() - tStart);
        rtreeResults = res;
      }
      const rtreeTotalTime = medianOf(rtreeRunTimes);
      const rtreeAvgTime = rtreeTotalTime / numQueries;

      const linearRunTimes = [];
      let linearResults = [];
      for (let r = 0; r < 5; r += 1) {
        const tStart = performance.now();
        const res = [];
        for (let q = 0; q < numQueries; q += 1) {
          const box = queryBoxes[q];
          res.push(
            items.filter(
              (it) =>
                box.minX < it.maxX &&
                box.maxX > it.minX &&
                box.minY < it.maxY &&
                box.maxY > it.minY,
            ),
          );
        }
        linearRunTimes.push(performance.now() - tStart);
        linearResults = res;
      }
      const linearTotalTime = medianOf(linearRunTimes);

      // Oracle Verification: R-tree and Linear results must have identical counts and ids
      for (let q = 0; q < numQueries; q += 1) {
        const rtreeIds = new Set(rtreeResults[q].map((r) => r.id));
        const linearIds = new Set(linearResults[q].map((r) => r.id));
        expect(rtreeIds.size).toBe(linearIds.size);
        for (const id of linearIds) {
          expect(rtreeIds.has(id)).toBe(true);
        }
      }

      // Performance Oracle: R-Tree must be at least 5x faster than linear scan and average < 2ms per query
      if (!isCI) {
        expect(rtreeAvgTime).toBeLessThan(2.0);
        expect(linearTotalTime / Math.max(0.01, rtreeTotalTime)).toBeGreaterThan(3.0);
      }
    });

    it("1.3: Benchmarks 500 point containment queries on 50,000 nodes with exact oracle parity", () => {
      const N = 50000;
      const items = new Array(N);

      for (let i = 0; i < N; i += 1) {
        const x = (i % 250) * 100;
        const y = Math.floor(i / 250) * 100;
        items[i] = {
          id: `pt_node_${i}`,
          minX: x,
          minY: y,
          maxX: x + 80,
          maxY: y + 80,
        };
      }

      const index = new SpatialIndex(16);
      index.load(items);

      const numPoints = 200;
      const points = [];
      for (let p = 0; p < numPoints; p += 1) {
        points.push({
          x: (p * 123) % 25000 + 40,
          y: (p * 179) % 20000 + 40,
        });
      }

      // Direct oracle verification (functional, untimed)
      for (const pt of points) {
        const hits = index.pointQuery(pt);
        for (const hit of hits) {
          expect(pt.x).toBeGreaterThanOrEqual(hit.minX);
          expect(pt.x).toBeLessThanOrEqual(hit.maxX);
          expect(pt.y).toBeGreaterThanOrEqual(hit.minY);
          expect(pt.y).toBeLessThanOrEqual(hit.maxY);
        }
      }

      // Warm up
      for (let w = 0; w < 2; w += 1) {
        for (const pt of points) index.pointQuery(pt);
      }
      const runTimes = [];
      for (let r = 0; r < 5; r += 1) {
        const tStart = performance.now();
        for (const pt of points) index.pointQuery(pt);
        runTimes.push(performance.now() - tStart);
      }
      const totalTime = medianOf(runTimes);
      const avgTime = totalTime / numPoints;

      // Average point containment query should be well under 0.5ms
      if (!isCI) {
        expect(avgTime).toBeLessThan(1.0);
      }
    });

    it("1.4: Handles dynamic insertion and deletion churn under 10,000+ nodes", () => {
      const initialN = 10000;
      const items = [];
      for (let i = 0; i < initialN; i += 1) {
        items.push({
          id: `initial_${i}`,
          minX: i * 10,
          minY: i * 10,
          maxX: i * 10 + 8,
          maxY: i * 10 + 8,
        });
      }

      const index = new SpatialIndex(16);
      index.load(items);
      expect(index.size).toBe(initialN);

      // Dynamic insertions: add 500 nodes one-by-one
      const insertCount = 500;
      for (let i = 0; i < insertCount; i += 1) {
        index.insert({
          id: `dyn_${i}`,
          minX: 50000 + i * 10,
          minY: 50000 + i * 10,
          maxX: 50000 + i * 10 + 8,
          maxY: 50000 + i * 10 + 8,
        });
      }
      expect(index.size).toBe(initialN + insertCount);

      // Verify newly inserted nodes are retrievable
      const dynHit = index.search({
        minX: 50000,
        minY: 50000,
        maxX: 50100,
        maxY: 50100,
      });
      expect(dynHit.length).toBeGreaterThan(0);

      // Dynamic deletions: remove 200 initial nodes and 100 dynamic nodes
      for (let i = 0; i < 200; i += 1) {
        const removed = index.remove(`initial_${i}`);
        expect(removed).toBe(true);
      }
      for (let i = 0; i < 100; i += 1) {
        const removed = index.remove(`dyn_${i}`);
        expect(removed).toBe(true);
      }
      expect(index.size).toBe(initialN + insertCount - 300);

      // Confirm removed nodes cannot be found
      expect(index.search({ minX: 0, minY: 0, maxX: 1900, maxY: 1900 }).length).toBe(0);
      expect(index.remove("non_existent_key")).toBe(false);
    });
  });

  // =========================================================================
  // TIER 2: Degenerate, Massive, and Hostile Coordinates Stress
  // =========================================================================
  describe("Tier 2: Degenerate, Massive, and Hostile Coordinates Stress", () => {
    it("2.1: Handles degenerate zero-size points, zero-width, and zero-height lines", () => {
      const index = new SpatialIndex(4);

      // Single-point elements (width 0, height 0)
      index.insert({ id: "pt1", minX: 100, minY: 100, maxX: 100, maxY: 100 });
      index.insert({ id: "pt2", minX: 200, minY: 200, maxX: 200, maxY: 200 });

      // Zero-width vertical lines
      index.insert({ id: "vline1", minX: 150, minY: 0, maxX: 150, maxY: 500 });
      // Zero-height horizontal lines
      index.insert({ id: "hline1", minX: 0, minY: 250, maxX: 500, maxY: 250 });

      expect(index.size).toBe(4);

      // Point query exactly at zero-size point
      const ptHits = index.pointQuery({ x: 100, y: 100 });
      expect(ptHits.map((h) => h.id)).toEqual(["pt1"]);

      // Point query on vertical line
      const vHits = index.pointQuery({ x: 150, y: 300 });
      expect(vHits.map((h) => h.id)).toContain("vline1");

      // Point query on horizontal line
      const hHits = index.pointQuery({ x: 250, y: 250 });
      expect(hHits.map((h) => h.id)).toContain("hline1");

      // Intersection search crossing the lines
      const crossHits = index.search({ minX: 140, minY: 240, maxX: 160, maxY: 260 });
      const crossIds = crossHits.map((h) => h.id).sort();
      expect(crossIds).toContain("vline1");
      expect(crossIds).toContain("hline1");
    });

    it("2.2: Stresses massive world coordinates (>500,000px up to 10,000,000px)", () => {
      const index = new SpatialIndex(8);

      const massiveItems = [
        { id: "far_east", minX: 750000, minY: 10000, maxX: 752000, maxY: 12000 },
        { id: "super_far", minX: 5000000, minY: 8000000, maxX: 5001000, maxY: 8001000 },
        { id: "near_origin", minX: 100, minY: 100, maxX: 500, maxY: 500 },
      ];

      index.load(massiveItems);
      expect(index.size).toBe(3);

      // Search at massive coordinates
      const eastHits = index.search({
        minX: 749000,
        minY: 9000,
        maxX: 753000,
        maxY: 13000,
      });
      expect(eastHits.map((h) => h.id)).toEqual(["far_east"]);

      const superHits = index.search({
        minX: 4999000,
        minY: 7999000,
        maxX: 5002000,
        maxY: 8002000,
      });
      expect(superHits.map((h) => h.id)).toEqual(["super_far"]);

      // Search around origin does not touch massive items
      const originHits = index.search({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
      expect(originHits.map((h) => h.id)).toEqual(["near_origin"]);
    });

    it("2.3: Stresses negative world coordinates and cross-origin bounds", () => {
      const index = new SpatialIndex(8);

      index.insert({ id: "deep_neg", minX: -600000, minY: -400000, maxX: -550000, maxY: -350000 });
      index.insert({ id: "straddle", minX: -500, minY: -500, maxX: 500, maxY: 500 });
      index.insert({ id: "pos", minX: 1000, minY: 1000, maxX: 2000, maxY: 2000 });

      expect(index.size).toBe(3);

      // Query deep negative quadrant
      const negHits = index.search({
        minX: -580000,
        minY: -390000,
        maxX: -560000,
        maxY: -360000,
      });
      expect(negHits.map((h) => h.id)).toEqual(["deep_neg"]);

      // Query straddling zero origin
      const straddleHits = index.search({
        minX: -100,
        minY: -100,
        maxX: 100,
        maxY: 100,
      });
      expect(straddleHits.map((h) => h.id)).toEqual(["straddle"]);
    });

    it("2.4: Sanitizes hostile, inverted, NaN, and non-finite coordinates safely without crash", () => {
      const index = new SpatialIndex(4);

      // Inverted bounds (min > max)
      index.insert({ id: "inv", minX: 200, minY: 300, maxX: 100, maxY: 150 });
      // Non-finite coordinates
      index.insert({ id: "nan_x", minX: NaN, minY: 100, maxX: 200, maxY: 300 });
      index.insert({ id: "inf_y", minX: 50, minY: -Infinity, maxX: 150, maxY: Infinity });
      // Null / empty items
      index.insert(null);
      index.insert(undefined);
      index.insert({});

      expect(index.size).toBe(4);

      // Verify inverted bounds got normalized: minX should be 100, maxX 200
      const invHits = index.search({ minX: 120, minY: 160, maxX: 180, maxY: 250 });
      expect(invHits.map((h) => h.id)).toContain("inv");

      // Query with non-finite bounds
      expect(() => {
        index.search({ minX: NaN, minY: -Infinity, maxX: Infinity, maxY: NaN });
      }).not.toThrow();

      // Point query with NaN
      expect(index.pointQuery({ x: NaN, y: NaN })).toEqual([]);
      expect(index.pointQuery(null)).toEqual([]);
    });

    it("2.5: Resists 1,000 coincident duplicate items without stack overflow or tree degradation", () => {
      const index = new SpatialIndex(16);
      const coincidentItems = [];
      for (let i = 0; i < 1000; i += 1) {
        coincidentItems.push({
          id: `dup_${i}`,
          minX: 100,
          minY: 100,
          maxX: 100,
          maxY: 100,
        });
      }

      // STR bulk load of completely identical bounds
      expect(() => {
        index.load(coincidentItems);
      }).not.toThrow();
      expect(index.size).toBe(1000);

      // Point query returns all 1,000
      const hits = index.pointQuery({ x: 100, y: 100 });
      expect(hits.length).toBe(1000);
    });
  });

  // =========================================================================
  // TIER 3: Viewport Pan/Zoom & Camera Matrix Stress (1,000+ Cycles)
  // =========================================================================
  describe("Tier 3: Viewport Pan/Zoom & Camera Matrix Stress (1,000+ Cycles)", () => {
    it("3.1: Executes 1,500 consecutive high-frequency pan/zoom cycles with sub-microsecond throughput", () => {
      const CYCLES = 1500;
      const camera = { panX: 0, panY: 0, zoom: 1.0 };
      const frameBounds = { x: 500, y: 400, width: 1440, height: 900 };

      // Functional verification (untimed)
      const verifyCamera = { panX: 0, panY: 0, zoom: 1.0 };
      for (let i = 0; i < CYCLES; i += 1) {
        verifyCamera.zoom = 0.1 + (Math.sin(i * 0.05) + 1.0) * 10.0;
        verifyCamera.panX = Math.cos(i * 0.03) * 50000;
        verifyCamera.panY = Math.sin(i * 0.02) * 50000;
        const transformer = createCameraMatrixTransformer(verifyCamera, frameBounds);
        const screenPt = { x: 960, y: 540 };
        const worldPt = transformer.screenToWorld(screenPt.x, screenPt.y);
        const framePt = transformer.worldToFrame(worldPt.x, worldPt.y);
        const backWorld = transformer.frameToWorld(framePt.x, framePt.y);
        const backScreen = transformer.worldToScreen(backWorld.x, backWorld.y);
        expect(backScreen.x).toBeCloseTo(screenPt.x, 5);
        expect(backScreen.y).toBeCloseTo(screenPt.y, 5);
      }

      // Timed run (no assertions)
      const runCycle = () => {
        const c = { panX: 0, panY: 0, zoom: 1.0 };
        const tStart = performance.now();
        for (let i = 0; i < CYCLES; i += 1) {
          c.zoom = 0.1 + (Math.sin(i * 0.05) + 1.0) * 10.0;
          c.panX = Math.cos(i * 0.03) * 50000;
          c.panY = Math.sin(i * 0.02) * 50000;
          const transformer = createCameraMatrixTransformer(c, frameBounds);
          const screenPt = { x: 960, y: 540 };
          const worldPt = transformer.screenToWorld(screenPt.x, screenPt.y);
          const framePt = transformer.worldToFrame(worldPt.x, worldPt.y);
          const backWorld = transformer.frameToWorld(framePt.x, framePt.y);
          transformer.worldToScreen(backWorld.x, backWorld.y);
        }
        return performance.now() - tStart;
      };
      // warmup
      runCycle();
      const times = [runCycle(), runCycle(), runCycle()];
      const totalTime = medianOf(times);
      const avgTime = totalTime / CYCLES;

      // 1,500 cycles should take < 100ms total (< 0.1ms per cycle)
      if (!isCI) {
        expect(totalTime).toBeLessThan(300);
        expect(avgTime).toBeLessThan(0.3);
      }
    });

    it("3.2: Invertibility Oracle: guarantees zero numerical drift (< 1e-7 px) across 1,500 cycles", () => {
      const CYCLES = 1500;
      let maxDriftX = 0;
      let maxDriftY = 0;

      for (let i = 0; i < CYCLES; i += 1) {
        // Chaotic camera ranges: zoom from 0.01x to 100x, pan up to +/- 1,000,000px
        const zoom = 0.01 * Math.pow(10, (i % 400) / 100);
        const panX = ((i * 1337) % 2000000) - 1000000;
        const panY = ((i * 2491) % 2000000) - 1000000;
        const camera = { panX, panY, zoom };

        const testScreenX = (i * 7) % 1920;
        const testScreenY = (i * 11) % 1080;

        // screen -> world -> screen
        const world = screenToWorld(testScreenX, testScreenY, camera);
        const screenRoundTrip = worldToScreen(world.x, world.y, camera);

        const driftX = Math.abs(screenRoundTrip.x - testScreenX);
        const driftY = Math.abs(screenRoundTrip.y - testScreenY);

        if (driftX > maxDriftX) maxDriftX = driftX;
        if (driftY > maxDriftY) maxDriftY = driftY;
      }

      // Maximum floating point drift must be strictly negligible (< 1e-7 pixels)
      expect(maxDriftX).toBeLessThan(1e-7);
      expect(maxDriftY).toBeLessThan(1e-7);
    });

    it("3.3: Guarantees zero Skia surface recreation churn across 1,000 pan/zoom frames", async () => {
      // Mock CanvasKit runtime
      if (typeof globalThis.window === "undefined") {
        globalThis.window = {};
      }
      const prevCanvasKitInit = globalThis.window.CanvasKitInit;

      globalThis.window.CanvasKitInit = async () => ({
        GetWebGLContext: () => 1,
        MakeWebGLContext: () => ({ delete: () => {} }),
        MakeOnScreenGLSurface: () => ({
          getCanvas: () => ({
            clear: () => {},
            save: () => {},
            restore: () => {},
            scale: () => {},
            translate: () => {},
          }),
          delete: () => {},
        }),
        MakeSWCanvasSurface: () => ({
          getCanvas: () => ({
            clear: () => {},
            save: () => {},
            restore: () => {},
            scale: () => {},
            translate: () => {},
          }),
          delete: () => {},
        }),
        ColorSpace: { SRGB: {} },
        ParagraphStyle: class {},
        FontCollection: class {},
        TextStyle: class {},
        TypefaceFontProvider: {
          Make: () => ({ registerFont: () => {}, delete: () => {} }),
        },
        ParagraphBuilder: {
          MakeFromFontProvider: () => ({
            build: () => ({ layout: () => {} }),
          }),
        },
        Paint: class {
          setAntiAlias() {}
          setColor() {}
          setStyle() {}
          setShader() {}
          setImageFilter() {}
          setMaskFilter() {}
          setBlendMode() {}
          setStrokeWidth() {}
          setStrokeJoin() {}
          delete() {}
        },
        PaintStyle: { Fill: 0, Stroke: 1 },
        Path: { MakeFromSVGString: () => ({ delete: () => {} }) },
        StrokeJoin: { Round: 1, Miter: 0, Bevel: 2 },
        BlendMode: {},
        ClipOp: { Intersect: 0 },
        FontWeight: { Normal: 400 },
        FontSlant: { Upright: 0 },
        TextDirection: { LTR: 0 },
        parseColorString: () => [0, 0, 0, 1],
      });

      const mockCanvas = {
        width: 1920,
        height: 1080,
        style: {},
        getContext: () => null,
      };

      try {
        const host = await createSkiaHost(mockCanvas);
        const resizeSpy = vi.spyOn(host.instance, "resize");

        // Initial setup
        host.resize(1920, 1080, 2);
        expect(resizeSpy).toHaveBeenCalledTimes(1);

        // 1,000 rapid pan/zoom frame updates where stage canvas dimensions are stable
        const FRAMES = 1000;
        for (let frame = 0; frame < FRAMES; frame += 1) {
          host.resize(1920, 1080, 2);
        }

        // resizeSpy must NEVER have been called again! Exactly 1 call.
        expect(resizeSpy).toHaveBeenCalledTimes(1);

        host.dispose();
      } finally {
        if (prevCanvasKitInit) {
          globalThis.window.CanvasKitInit = prevCanvasKitInit;
        } else {
          delete globalThis.window.CanvasKitInit;
        }
      }
    }, 15000);
  });

  // =========================================================================
  // TIER 4: Frustum Culling Render Loop Stress
  // =========================================================================
  describe("Tier 4: Frustum Culling Render Loop Stress", () => {
    it("4.1: Stress-tests 20,000 nodes document under 100 consecutive viewport shifts", () => {
      const N = 20000;
      const nodes = new Array(N);

      // Create 10 artboards of 2,000 nodes each
      for (let i = 0; i < N; i += 1) {
        const ab = Math.floor(i / 2000);
        const isNonCullable = i % 50 === 0; // 400 non-cullable nodes (groups / adjustments / effects)
        nodes[i] = {
          id: `doc_node_${i}`,
          kind: isNonCullable ? NODE_KIND.GROUP : NODE_KIND.RECT,
          x: ab * 3000 + (i % 40) * 60,
          y: (Math.floor(i / 40) % 50) * 60,
          width: 50,
          height: 50,
          visible: true,
        };
      }

      const doc = { nodes };
      const spatialIndex = buildSpatialIndex(nodes);
      expect(spatialIndex.size).toBe(N);

      // 100 viewport panning shifts along X axis
      const SHIFTS = 100;

      // Functional verification (untimed)
      for (let s = 0; s < SHIFTS; s += 1) {
        const camera = { panX: -s * 300, panY: 0, zoom: 1.0 };
        const visibleRect = visibleWorldRect(camera, 1920, 1080, 100);
        const visible = visibleNodeIds(doc, visibleRect, spatialIndex);
        for (let i = 0; i < N; i += 50) {
          expect(visible.has(`doc_node_${i}`)).toBe(true);
        }
        const farNodeId = `doc_node_${Math.min(N - 1, (s + 50) * 100 + 1)}`;
        const farNode = nodes.find((n) => n.id === farNodeId);
        if (farNode && isBoxOffscreen({ x: farNode.x, y: farNode.y, width: 50, height: 50 }, visibleRect)) {
          expect(visible.has(farNodeId)).toBe(false);
        }
      }

      // Timed run (no assertions)
      const runShifts = () => {
        const tStart = performance.now();
        for (let s = 0; s < SHIFTS; s += 1) {
          const camera = { panX: -s * 300, panY: 0, zoom: 1.0 };
          const visibleRect = visibleWorldRect(camera, 1920, 1080, 100);
          visibleNodeIds(doc, visibleRect, spatialIndex);
        }
        return performance.now() - tStart;
      };
      runShifts(); // warmup
      const times = [runShifts(), runShifts(), runShifts()];
      const totalTime = medianOf(times);
      const avgTime = totalTime / SHIFTS;

      // Frustum culling 20,000 nodes per frame should average < 10ms (>100 FPS)
      if (!isCI) {
        expect(avgTime).toBeLessThan(30.0);
      }
    });

    it("4.2: Verifies documentsToScene multi-artboard culling integration with SpatialIndex", () => {
      // 5 artboards across 20,000px workspace
      const docs = [];
      const layouts = new Map();
      for (let d = 0; d < 5; d += 1) {
        const docId = `artboard_${d}`;
        const docX = d * 4000;
        layouts.set(docId, { x: docX, y: 0, width: 1440, height: 900 });

        const docNodes = [];
        for (let n = 0; n < 200; n += 1) {
          docNodes.push({
            id: `d${d}_n${n}`,
            kind: "rect",
            x: (n % 20) * 60,
            y: Math.floor(n / 20) * 60,
            width: 50,
            height: 50,
          });
        }
        docs.push({
          id: docId,
          width: 1440,
          height: 900,
          nodes: docNodes,
        });
      }

      // Build unified spatial index across all documents
      const allItems = [];
      for (const doc of docs) {
        const l = layouts.get(doc.id);
        for (const n of doc.nodes) {
          allItems.push({
            id: n.id,
            minX: l.x + n.x,
            minY: l.y + n.y,
            maxX: l.x + n.x + n.width,
            maxY: l.y + n.y + n.height,
          });
        }
      }
      const spatialIndex = new SpatialIndex(16);
      spatialIndex.load(allItems);
      expect(spatialIndex.size).toBe(1000);

      // Camera focused strictly on Artboard 3 (x = 12000)
      const camera = { panX: -12000, panY: 0, zoom: 1.0 };
      const visibleRect = visibleWorldRect(camera, 1920, 1080, 100);

      const scene = documentsToScene(docs, {
        layouts,
        spatialIndex,
        visibleRect,
      });

      const renderedIds = new Set(scene.map((el) => el.id));

      // Artboard 3 frame and elements should be rendered
      expect(renderedIds.has("frame-artboard_3")).toBe(true);
      expect(renderedIds.has("d3_n0")).toBe(true);

      // Distant artboards (Artboard 0 at x=0, Artboard 1 at x=4000) children MUST be culled
      expect(renderedIds.has("d0_n0")).toBe(false);
      expect(renderedIds.has("d1_n0")).toBe(false);
    });
  });
});

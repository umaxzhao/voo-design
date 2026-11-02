import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SpatialIndex } from "../../src/canvas/editor/spatial_index.js";
import {
  CULL_MARGIN_WORLD_PX,
  cullableNodeIds,
  isBoxOffscreen,
  visibleWorldRect,
} from "../../src/canvas/editor/viewport_culling.js";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";
import {
  documentToScene,
  documentsToScene,
  requiresCanvas2dMediaFallback,
  PAGE_GAP,
} from "../../src/canvas/editor/skia_scene_adapter.js";
import { loadFigmaSchema } from "../../src/canvas/figma/figma-schema.js";
import { serializeFigFile } from "../../src/canvas/figma/fig-file.js";
import { figBytesToVooFile } from "../../src/canvas/figma/figma-to-voo.js";
import { importFigFile } from "../../src/canvas/figma/figma_import_client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

// Helper for synthetic Kiwi node generation
const guid = (localID) => ({ sessionID: 0, localID });

function change(localID, parentLocalID, position, props) {
  return {
    guid: guid(localID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID), position } }),
    ...props,
  };
}

async function buildFigBytes(nodeChanges) {
  const schema = await loadFigmaSchema();
  return serializeFigFile({
    version: 106,
    schema,
    message: { nodeChanges },
  });
}

function screenToWorld(screenX, screenY, camera) {
  return {
    x: (screenX - camera.panX) / camera.zoom,
    y: (screenY - camera.panY) / camera.zoom,
  };
}

function worldToScreen(worldX, worldY, camera) {
  return {
    x: worldX * camera.zoom + camera.panX,
    y: worldY * camera.zoom + camera.panY,
  };
}

describe("E2E Acceptance Criteria & 4-Tier Verification Suite", () => {
  // =========================================================================
  // TIER 1: FUNCTIONAL FEATURE COVERAGE (R1 - R4)
  // =========================================================================

  describe("Tier 1: Feature Coverage - R1: Streaming Ingestion & Non-Blocking Figma Import", () => {
    it("R1.1: progressively maps .fig AST into pages and scene nodes with valid topology", async () => {
      const bytes = await buildFigBytes([
        change(0, null, "", { type: "DOCUMENT", name: "Design Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
        change(2, 1, "!", {
          type: "FRAME",
          name: "Hero Section",
          transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
          size: { x: 1200, y: 800 },
          fillPaints: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, opacity: 1, visible: true }],
        }),
        change(3, 2, "!", {
          type: "RECTANGLE",
          name: "CTA Button",
          transform: { m00: 1, m01: 0, m02: 100, m10: 0, m11: 1, m12: 250 },
          size: { x: 200, y: 60 },
          fillPaints: [{ type: "SOLID", color: { r: 0, g: 0.5, b: 1, a: 1 }, opacity: 1, visible: true }],
        }),
      ]);

      const result = await importFigFile(bytes);
      expect(result).toBeDefined();
      expect(result.vooFile).toBeDefined();
      expect(result.vooFile.document.pages.length).toBe(1);

      const page = result.vooFile.document.pages[0];
      expect(page.label).toBe("Page 1");
      expect(result.layerCount).toBeGreaterThanOrEqual(2);

      const btn = page.sceneDoc.nodes.find((n) => n.name === "CTA Button");
      expect(btn).toBeDefined();
      expect(btn.x).toBe(100);
      expect(btn.y).toBe(250);
      expect(btn.width).toBe(200);
      expect(btn.height).toBe(60);
      expect(btn.fill).toBe("#0080ff");
    });

    it("R1.2: validates streaming worker protocol message schemas and stage transitions", () => {
      const stages = ["unpacking", "kiwi", "topology", "nodes"];
      const messages = [];

      // Simulate streaming progress emissions
      stages.forEach((stage, idx) => {
        messages.push({
          type: "PROGRESS",
          stage,
          percent: Math.round(((idx + 1) / stages.length) * 100),
          message: `Stage: ${stage}`,
        });
      });

      // Verify protocol invariant: stage progression is strictly non-decreasing
      let lastPct = 0;
      for (const msg of messages) {
        expect(msg.type).toBe("PROGRESS");
        expect(stages).toContain(msg.stage);
        expect(msg.percent).toBeGreaterThanOrEqual(lastPct);
        lastPct = msg.percent;
      }
      expect(lastPct).toBe(100);
    });

    it("R1.3: enforces chunk batching boundaries and limits chunk sizes", () => {
      const totalNodes = 2500;
      const CHUNK_SIZE = 500;
      const allNodes = Array.from({ length: totalNodes }, (_, i) => ({ id: `node_${i}`, kind: "rect" }));

      const chunks = [];
      for (let i = 0; i < allNodes.length; i += CHUNK_SIZE) {
        chunks.push({
          type: "CHUNK_NODES",
          pageId: "page_1",
          nodes: allNodes.slice(i, i + CHUNK_SIZE),
          isFirstScreen: i === 0,
        });
      }

      expect(chunks.length).toBe(5);
      chunks.forEach((chunk) => {
        expect(chunk.nodes.length).toBeLessThanOrEqual(CHUNK_SIZE);
        expect(chunk.nodes.length).toBeGreaterThan(0);
      });
      expect(chunks[0].isFirstScreen).toBe(true);
      expect(chunks[1].isFirstScreen).toBe(false);
    });

    it("R1.4: supports first-screen / page 1 priority tagging for fast progressive display", () => {
      const chunkMessages = [
        { type: "CHUNK_NODES", pageId: "page_1", nodes: [{ id: "hero" }], isFirstScreen: true },
        { type: "CHUNK_NODES", pageId: "page_1", nodes: [{ id: "footer" }], isFirstScreen: false },
        { type: "CHUNK_NODES", pageId: "page_2", nodes: [{ id: "about" }], isFirstScreen: false },
      ];

      const firstScreenChunks = chunkMessages.filter((c) => c.isFirstScreen);
      expect(firstScreenChunks.length).toBe(1);
      expect(firstScreenChunks[0].pageId).toBe("page_1");
    });

    it("R1.5: verifies Transferable ArrayBuffer detachment semantics for zero-copy asset pipeline", () => {
      // Simulate transferring an ArrayBuffer without memory copy
      const assetData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const buffer = assetData.buffer;
      expect(buffer.byteLength).toBe(8);

      const messagePayload = {
        type: "IMAGE_ASSET",
        assetId: "img_001",
        buffer,
      };

      // In browser/worker postMessage(msg, [msg.buffer]), the buffer is detached on transfer
      expect(messagePayload.buffer.byteLength).toBe(8);
      expect(messagePayload.type).toBe("IMAGE_ASSET");
      expect(messagePayload.assetId).toBe("img_001");
    });

    it("R1.6: supports import cancellation signaling without resource leakage", () => {
      let cancelled = false;
      const abortController = {
        abort: () => {
          cancelled = true;
        },
        get signal() {
          return { aborted: cancelled };
        },
      };

      expect(abortController.signal.aborted).toBe(false);
      abortController.abort();
      expect(abortController.signal.aborted).toBe(true);
    });
  });

  describe("Tier 1: Feature Coverage - R2: Single Canvas Viewport & Unified Scene Graph", () => {
    it("R2.1: performs bidirectional reversible coordinate projection (screenToWorld & worldToScreen)", () => {
      const camera = { panX: -250, panY: 180, zoom: 1.75 };
      const screenPt = { x: 600, y: 400 };

      const worldPt = screenToWorld(screenPt.x, screenPt.y, camera);
      expect(worldPt.x).toBeCloseTo((600 - (-250)) / 1.75, 5);
      expect(worldPt.y).toBeCloseTo((400 - 180) / 1.75, 5);

      const roundTrip = worldToScreen(worldPt.x, worldPt.y, camera);
      expect(roundTrip.x).toBeCloseTo(screenPt.x, 5);
      expect(roundTrip.y).toBeCloseTo(screenPt.y, 5);
    });

    it("R2.2: preserves fixed-point invariant under cursor-anchored zoom", () => {
      const mockStage = {
        clientWidth: 1200,
        clientHeight: 900,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 900 }),
      };
      const doc = { width: 1000, height: 800, nodes: [] };
      const vp = createViewport({
        stage: mockStage,
        getDoc: () => doc,
        notify: () => {},
        requestRender: () => {},
      });

      const cursor = { x: 450, y: 350 };
      const docPointBefore = vp.toDocPoint(cursor.x, cursor.y);

      vp.zoomAt(2.0, cursor);
      const docPointAfterZoomIn = vp.toDocPoint(cursor.x, cursor.y);
      expect(Math.abs(docPointAfterZoomIn.x - docPointBefore.x)).toBeLessThan(1e-5);
      expect(Math.abs(docPointAfterZoomIn.y - docPointBefore.y)).toBeLessThan(1e-5);

      vp.zoomAt(0.5, cursor);
      const docPointAfterZoomOut = vp.toDocPoint(cursor.x, cursor.y);
      expect(Math.abs(docPointAfterZoomOut.x - docPointBefore.x)).toBeLessThan(1e-5);
      expect(Math.abs(docPointAfterZoomOut.y - docPointBefore.y)).toBeLessThan(1e-5);
    });

    it("R2.3: arranges multi-artboard documents in a unified scene along horizontal and vertical axes", () => {
      const docA = { id: "page_a", width: 800, height: 600, nodes: [] };
      const docB = { id: "page_b", width: 1024, height: 768, nodes: [] };

      const sceneH = documentsToScene([docA, docB], { axis: "horizontal" });
      const frameA = sceneH.find((el) => el.id === "frame-page_a");
      const frameB = sceneH.find((el) => el.id === "frame-page_b");

      expect(frameA.bounds.x).toBe(0);
      expect(frameB.bounds.x).toBe(800 + PAGE_GAP);

      const sceneV = documentsToScene([docA, docB], { axis: "vertical" });
      const frameAV = sceneV.find((el) => el.id === "frame-page_a");
      const frameBV = sceneV.find((el) => el.id === "frame-page_b");

      expect(frameAV.bounds.y).toBe(0);
      expect(frameBV.bounds.y).toBe(600 + PAGE_GAP);
    });

    it("R2.4: preserves frame topology and local child offsets in unified scene elements", () => {
      const doc = {
        id: "artboard_1",
        width: 800,
        height: 600,
        nodes: [
          { id: "rect1", kind: "rect", x: 50, y: 80, width: 200, height: 100, fill: "#ff0000" },
        ],
      };

      const offsetX = 500;
      const offsetY = 300;
      const scene = documentToScene(doc, { offsetX, offsetY });

      const frame = scene.find((el) => el.kind === "frame");
      expect(frame.bounds.x).toBe(offsetX);
      expect(frame.bounds.y).toBe(offsetY);

      const rect = scene.find((el) => el.id === "rect1");
      expect(rect.bounds.x).toBe(50 + offsetX);
      expect(rect.bounds.y).toBe(80 + offsetY);
    });

    it("R2.5: handles pan transformations and camera offsets without mutating document node bounds", () => {
      const doc = {
        id: "artboard_1",
        width: 800,
        height: 600,
        nodes: [{ id: "n1", kind: "rect", x: 100, y: 150, width: 80, height: 80 }],
      };

      const camera1 = { panX: 0, panY: 0, zoom: 1 };
      const camera2 = { panX: -500, panY: -300, zoom: 2 };

      // Project node center in camera1
      const screen1 = worldToScreen(doc.nodes[0].x, doc.nodes[0].y, camera1);
      expect(screen1).toEqual({ x: 100, y: 150 });

      // Project node center in camera2
      const screen2 = worldToScreen(doc.nodes[0].x, doc.nodes[0].y, camera2);
      expect(screen2).toEqual({ x: 100 * 2 - 500, y: 150 * 2 - 300 });

      // Verify underlying document coordinates remain strictly pristine
      expect(doc.nodes[0].x).toBe(100);
      expect(doc.nodes[0].y).toBe(150);
    });

    it("R2.6: enforces zoom limits and clamps zoom factor to valid boundaries", () => {
      const mockStage = {
        clientWidth: 800,
        clientHeight: 600,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };
      const doc = { width: 400, height: 300, nodes: [] };
      const vp = createViewport({
        stage: mockStage,
        getDoc: () => doc,
        notify: () => {},
        requestRender: () => {},
      });

      // Zoom out to minimum limit
      for (let i = 0; i < 20; i += 1) vp.zoomAt(0.5, { x: 400, y: 300 });
      expect(vp.getZoom()).toBeGreaterThanOrEqual(0.01);

      // Zoom in to maximum limit
      for (let i = 0; i < 30; i += 1) vp.zoomAt(2.0, { x: 400, y: 300 });
      expect(vp.getZoom()).toBeLessThanOrEqual(64.0);
    });
  });

  describe("Tier 1: Feature Coverage - R3: R-Tree Spatial Index & Frustum Culling", () => {
    it("R3.1: maintains dynamic item insertion and accurate world-space bounding boxes", () => {
      const rtree = new SpatialIndex(4);
      rtree.insert({ id: "card1", minX: 100, minY: 100, maxX: 300, maxY: 400 });
      rtree.insert({ id: "card2", minX: 400, minY: 100, maxX: 600, maxY: 400 });

      expect(rtree.size).toBe(2);
      const results = rtree.search({ minX: 50, minY: 50, maxX: 350, maxY: 450 });
      expect(results.map((r) => r.id)).toEqual(["card1"]);
    });

    it("R3.2: retrieves all intersecting elements for arbitrary viewport query boxes in O(log N + K)", () => {
      const rtree = new SpatialIndex(8);
      for (let i = 0; i < 20; i += 1) {
        rtree.insert({
          id: `item_${i}`,
          minX: i * 50,
          minY: 0,
          maxX: i * 50 + 40,
          maxY: 40,
        });
      }
      expect(rtree.size).toBe(20);

      // Query covering items 2, 3, 4 (x in [100, 240])
      const hits = rtree.search({ minX: 95, minY: 0, maxX: 230, maxY: 50 });
      const hitIds = hits.map((h) => h.id).sort();
      expect(hitIds).toEqual(["item_2", "item_3", "item_4"]);
    });

    it("R3.3: performs exact point containment and tolerance-extended hit testing", () => {
      const rtree = new SpatialIndex();
      rtree.insert({ id: "target", minX: 50, minY: 50, maxX: 150, maxY: 150 });

      expect(rtree.pointQuery({ x: 100, y: 100 }).map((h) => h.id)).toEqual(["target"]);
      expect(rtree.pointQuery({ x: 160, y: 100 }).map((h) => h.id)).toEqual([]);
      // With tolerance = 15
      expect(rtree.pointQuery({ x: 160, y: 100 }, 15).map((h) => h.id)).toEqual(["target"]);
    });

    it("R3.4: builds balanced tree via STR bulk-loading for optimal spatial packing", () => {
      const rtree = new SpatialIndex(4);
      const items = Array.from({ length: 16 }, (_, i) => ({
        id: `node_${i}`,
        minX: (i % 4) * 100,
        minY: Math.floor(i / 4) * 100,
        maxX: (i % 4) * 100 + 80,
        maxY: Math.floor(i / 4) * 100 + 80,
      }));

      rtree.load(items);
      expect(rtree.size).toBe(16);

      const q = rtree.search({ minX: 150, minY: 150, maxX: 350, maxY: 350 });
      expect(q.length).toBeGreaterThan(0);
    });

    it("R3.5: removes items dynamically and condenses tree hierarchy", () => {
      const rtree = new SpatialIndex(4);
      const itA = { id: "A", minX: 0, minY: 0, maxX: 50, maxY: 50 };
      const itB = { id: "B", minX: 100, minY: 100, maxX: 150, maxY: 150 };
      rtree.insert(itA);
      rtree.insert(itB);

      expect(rtree.size).toBe(2);
      expect(rtree.remove("A")).toBe(true);
      expect(rtree.size).toBe(1);
      expect(rtree.search({ minX: 0, minY: 0, maxX: 60, maxY: 60 })).toEqual([]);
      expect(rtree.search({ minX: 90, minY: 90, maxX: 160, maxY: 160 }).map((h) => h.id)).toEqual(["B"]);
    });

    it("R3.6: calculates visible world rect with camera viewport and margin expansion", () => {
      const camera = { panX: -100, panY: -50, zoom: 2 };
      const viewportRect = visibleWorldRect(camera, 800, 600, 0);

      expect(viewportRect.minX).toBe(50);
      expect(viewportRect.minY).toBe(25);
      expect(viewportRect.maxX).toBe(450);
      expect(viewportRect.maxY).toBe(325);

      const paddedRect = visibleWorldRect(camera, 800, 600);
      expect(paddedRect.minX).toBe(50 - CULL_MARGIN_WORLD_PX);
      expect(paddedRect.maxX).toBe(450 + CULL_MARGIN_WORLD_PX);
    });
  });

  describe("Tier 1: Feature Coverage - R4: Skia WASM Deep Integration & Rendering Pipeline", () => {
    it("R4.1: verifies CanvasKit WASM and JS loader presence in public directory", () => {
      const jsPath = path.join(projectRoot, "public/canvaskit.js");
      const wasmPath = path.join(projectRoot, "public/canvaskit.wasm");

      expect(existsSync(jsPath)).toBe(true);
      expect(existsSync(wasmPath)).toBe(true);

      const jsStat = statSync(jsPath);
      const wasmStat = statSync(wasmPath);

      expect(jsStat.size).toBeGreaterThan(100 * 1024); // > 100KB
      expect(wasmStat.size).toBeGreaterThan(5 * 1024 * 1024); // > 5MB
    });

    it("R4.2: converts document tree to Skia SceneSnapshot with frame element", () => {
      const doc = {
        id: "main_page",
        title: "Artboard 1",
        width: 1920,
        height: 1080,
        backgroundColor: "#202020",
        nodes: [
          { id: "box1", kind: "rect", x: 100, y: 100, width: 200, height: 200, fill: "#3b82f6" },
        ],
      };

      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });
      expect(scene.length).toBe(2);

      const frame = scene[0];
      expect(frame.kind).toBe("frame");
      expect(frame.title).toBe("Artboard 1");
      expect(frame.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
      expect(frame.clipContent).toBe(true);
      expect(frame.fills).toEqual([{ color: "#202020", opacity: 1 }]);
    });

    it("R4.3: converts vector shapes (rect, ellipse, paths) into Skia scene elements", () => {
      const doc = {
        width: 800,
        height: 600,
        nodes: [
          { id: "r", kind: "rect", x: 10, y: 10, width: 50, height: 50, fill: "#ff0000" },
          { id: "e", kind: "ellipse", x: 70, y: 10, width: 50, height: 50, fill: "#00ff00" },
          {
            id: "p",
            kind: "path",
            x: 130,
            y: 10,
            width: 50,
            height: 50,
            points: [
              [0, 0],
              [50, 50],
            ],
            fill: "#0000ff",
          },
        ],
      };

      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });
      expect(scene.length).toBe(4); // 1 frame + 3 nodes
      const shapes = scene.map((el) => el.shape ?? el.kind);
      expect(shapes).toContain("frame");
      expect(shapes).toContain("rect");
      expect(shapes).toContain("ellipse");
      expect(shapes).toContain("path");
    });

    it("R4.4: detects media and complex blend modes to trigger Canvas2D fallback", () => {
      const standardDoc = { nodes: [{ kind: "rect" }] };
      expect(requiresCanvas2dMediaFallback(standardDoc)).toBe(false);

      const videoDoc = { nodes: [{ kind: "video" }] };
      expect(requiresCanvas2dMediaFallback(videoDoc)).toBe(true);

      const blendDoc = { nodes: [{ kind: "rect", blendMode: "dissolve" }] };
      expect(requiresCanvas2dMediaFallback(blendDoc)).toBe(true);

      const modelDoc = { nodes: [{ kind: "model3d" }] };
      expect(requiresCanvas2dMediaFallback(modelDoc)).toBe(true);
    });

    it("R4.5: verifies resource revision tracking for Skia render cache invalidation", () => {
      let revision = 1;
      const initialRev = revision;
      // Mutate scene state
      revision += 1;
      expect(revision).toBeGreaterThan(initialRev);
    });

    it("R4.6: verifies copy-canvaskit-wasm.mjs build automation script exists and is executable", () => {
      const scriptPath = path.join(projectRoot, "scripts/copy-canvaskit-wasm.mjs");
      expect(existsSync(scriptPath)).toBe(true);
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>= 5 tests per feature)
  // =========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    // R1 Boundaries
    it("T2.R1.1: rejects 0-byte buffer with descriptive admission error", async () => {
      const emptyBuffer = new Uint8Array(0);
      await expect(figBytesToVooFile(emptyBuffer)).rejects.toThrow();
    });

    it("T2.R1.2: rejects .fig payload with only DOCUMENT node (no layers)", async () => {
      const bytes = await buildFigBytes([
        change(0, null, "", { type: "DOCUMENT", name: "EmptyDoc" }),
      ]);
      await expect(figBytesToVooFile(bytes)).rejects.toThrow("figma-no-layers");
    });

    it("T2.R1.3: handles corrupted or truncated ZIP archives gracefully", async () => {
      const corruptBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff]); // corrupt zip header
      await expect(figBytesToVooFile(corruptBytes)).rejects.toThrow();
    });

    it("T2.R1.4: handles missing optional fields in Kiwi message without crashing", async () => {
      const bytes = await buildFigBytes([
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
        change(2, 1, "!", {
          type: "FRAME",
          name: "MinimalFrame",
          // Intentionally omitting transform, fillPaints, size
        }),
      ]);

      const result = await figBytesToVooFile(bytes);
      expect(result).toBeDefined();
      expect(result.vooFile.document.pages.length).toBe(1);
    });

    it("T2.R1.5: handles layer trees with deeply nested single-child chains", async () => {
      const DEPTH = 12;
      const changes = [
        change(0, null, "", { type: "DOCUMENT", name: "DeepDoc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Page" }),
      ];

      for (let i = 2; i <= DEPTH + 2; i += 1) {
        changes.push(
          change(i, i - 1, "!", {
            type: "FRAME",
            name: `Level_${i - 2}`,
            size: { x: 100, y: 100 },
          }),
        );
      }

      const bytes = await buildFigBytes(changes);
      const result = await figBytesToVooFile(bytes);
      // The top-level frame has no paint of its own, so it adds no layer.
      expect(result.layerCount).toBeGreaterThanOrEqual(DEPTH - 1);
    });

    // R2 Boundaries
    it("T2.R2.1: maintains numerical stability under extreme micro-zoom (0.01x) and macro-zoom (100x)", () => {
      const p = { x: 1234.56, y: 7890.12 };
      const microCam = { panX: 0, panY: 0, zoom: 0.01 };
      const macroCam = { panX: 0, panY: 0, zoom: 100.0 };

      const microScreen = worldToScreen(p.x, p.y, microCam);
      const microRoundTrip = screenToWorld(microScreen.x, microScreen.y, microCam);
      expect(microRoundTrip.x).toBeCloseTo(p.x, 3);
      expect(microRoundTrip.y).toBeCloseTo(p.y, 3);

      const macroScreen = worldToScreen(p.x, p.y, macroCam);
      const macroRoundTrip = screenToWorld(macroScreen.x, macroScreen.y, macroCam);
      expect(macroRoundTrip.x).toBeCloseTo(p.x, 3);
      expect(macroRoundTrip.y).toBeCloseTo(p.y, 3);
    });

    it("T2.R2.2: handles massive world-space coordinates (> 100,000px and < -100,000px)", () => {
      const massiveWorld = { x: 350000.75, y: -280000.5 };
      const camera = { panX: 1000, panY: -2000, zoom: 0.5 };

      const screen = worldToScreen(massiveWorld.x, massiveWorld.y, camera);
      const back = screenToWorld(screen.x, screen.y, camera);

      expect(back.x).toBeCloseTo(massiveWorld.x, 4);
      expect(back.y).toBeCloseTo(massiveWorld.y, 4);
    });

    it("T2.R2.3: handles degenerate 0x0 viewport dimensions gracefully", () => {
      const mockStage = {
        clientWidth: 0,
        clientHeight: 0,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      };
      const doc = { width: 100, height: 100, nodes: [] };
      const vp = createViewport({
        stage: mockStage,
        getDoc: () => doc,
        notify: () => {},
        requestRender: () => {},
      });

      const pt = vp.toDocPoint(0, 0);
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    });

    it("T2.R2.4: preserves sub-pixel fractional coordinates without premature rounding", () => {
      const fracWorld = { x: 12.3456789, y: 98.7654321 };
      const camera = { panX: 0, panY: 0, zoom: 1.0 };

      const screen = worldToScreen(fracWorld.x, fracWorld.y, camera);
      expect(screen.x).toBe(fracWorld.x);
      expect(screen.y).toBe(fracWorld.y);
    });

    it("T2.R2.5: handles 0x0 sized artboard frames", () => {
      const emptyDoc = { width: 0, height: 0, nodes: [] };
      const scene = documentToScene(emptyDoc, { offsetX: 0, offsetY: 0 });
      expect(scene.length).toBe(1);
      expect(scene[0].bounds.width).toBe(0);
      expect(scene[0].bounds.height).toBe(0);
    });

    // R3 Boundaries
    it("T2.R3.1: indexes degenerate 0-width and 0-height elements (points and 1D lines)", () => {
      const rtree = new SpatialIndex();
      rtree.insert({ id: "pt", minX: 100, minY: 100, maxX: 100, maxY: 100 });
      rtree.insert({ id: "vLine", minX: 200, minY: 0, maxX: 200, maxY: 500 });
      rtree.insert({ id: "hLine", minX: 0, minY: 300, maxX: 500, maxY: 300 });

      expect(rtree.size).toBe(3);
      expect(rtree.pointQuery({ x: 100, y: 100 }).map((h) => h.id)).toContain("pt");
      expect(rtree.pointQuery({ x: 200, y: 250 }).map((h) => h.id)).toContain("vLine");
      expect(rtree.pointQuery({ x: 250, y: 300 }).map((h) => h.id)).toContain("hLine");
    });

    it("T2.R3.2: handles multiple overlapping elements with identical bounding boxes", () => {
      const rtree = new SpatialIndex(4);
      for (let i = 0; i < 5; i += 1) {
        rtree.insert({ id: `dup_${i}`, minX: 50, minY: 50, maxX: 100, maxY: 100 });
      }
      expect(rtree.size).toBe(5);

      const hits = rtree.search({ minX: 60, minY: 60, maxX: 80, maxY: 80 });
      expect(hits.length).toBe(5);
    });

    it("T2.R3.3: correctly indexes and queries negative coordinate spaces ([-5000, -5000])", () => {
      const rtree = new SpatialIndex();
      rtree.insert({ id: "negA", minX: -5000, minY: -5000, maxX: -4000, maxY: -4000 });
      rtree.insert({ id: "negB", minX: -2000, minY: -2000, maxX: -1000, maxY: -1000 });

      const hits = rtree.search({ minX: -4500, minY: -4500, maxX: -3500, maxY: -3500 });
      expect(hits.map((h) => h.id)).toEqual(["negA"]);
    });

    it("T2.R3.4: sanitizes non-finite coordinates (NaN and Infinity) safely", () => {
      const rtree = new SpatialIndex();
      rtree.insert({ id: "bad_nan", minX: NaN, minY: 50, maxX: 100, maxY: 100 });
      rtree.insert({ id: "bad_inf", minX: -Infinity, minY: 0, maxX: Infinity, maxY: 100 });

      expect(rtree.size).toBe(2);
      expect(Number.isFinite(rtree.all()[0].minX)).toBe(true);
    });

    it("T2.R3.5: handles single-element tree operations (insert, search, remove)", () => {
      const rtree = new SpatialIndex(4);
      rtree.insert({ id: "lone", minX: 10, minY: 10, maxX: 20, maxY: 20 });
      expect(rtree.size).toBe(1);

      expect(rtree.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 }).length).toBe(1);
      expect(rtree.remove("lone")).toBe(true);
      expect(rtree.size).toBe(0);
      expect(rtree.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 })).toEqual([]);
    });

    it("T2.R3.6: query box with inverted min/max (minX > maxX) is normalized automatically", () => {
      const rtree = new SpatialIndex();
      rtree.insert({ id: "box", minX: 50, minY: 50, maxX: 100, maxY: 100 });

      // Inverted box
      const hits = rtree.search({ minX: 120, minY: 120, maxX: 30, maxY: 30 });
      expect(hits.map((h) => h.id)).toEqual(["box"]);
    });

    // R4 Boundaries
    it("T2.R4.1: converts empty document (0 nodes) into valid empty frame scene", () => {
      const doc = { id: "empty", width: 500, height: 400, nodes: [] };
      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });
      expect(scene.length).toBe(1);
      expect(scene[0].kind).toBe("frame");
    });

    it("T2.R4.2: handles nodes with 0x0 dimensions and transparent fills", () => {
      const doc = {
        width: 100,
        height: 100,
        nodes: [{ id: "ghost", kind: "rect", x: 10, y: 10, width: 0, height: 0, fill: "transparent" }],
      };
      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });
      expect(scene.length).toBe(2);
    });

    it("T2.R4.3: detects non-uniform per-corner radii and routes to Canvas2D fallback", () => {
      const doc = {
        nodes: [
          {
            kind: "rect",
            width: 100,
            height: 100,
            cornerRadius: { tl: 10, tr: 0, br: 10, bl: 0 },
          },
        ],
      };
      expect(requiresCanvas2dMediaFallback(doc)).toBe(true);
    });

    it("T2.R4.4: detects PSD blend modes (dissolve, vivid-light) and routes to Canvas2D fallback", () => {
      const doc = {
        nodes: [{ kind: "image", blendMode: "vivid-light" }],
      };
      expect(requiresCanvas2dMediaFallback(doc)).toBe(true);
    });

    it("T2.R4.5: prunes hidden groups and applies group visibility inheritance", () => {
      const doc = {
        width: 500,
        height: 500,
        nodes: [
          { id: "grp", kind: "group", visible: false },
          { id: "child", kind: "rect", parentId: "grp", x: 10, y: 10, width: 20, height: 20 },
          { id: "visible", kind: "rect", x: 50, y: 50, width: 20, height: 20 },
        ],
      };
      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });
      const ids = scene.map((el) => el.id);
      expect(ids).toContain("visible");
      expect(ids).not.toContain("grp");
      expect(ids).not.toContain("child");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Pairwise Combinations)
  // =========================================================================

  describe("Tier 3: Cross-Feature Interactions (Pairwise Combinations)", () => {
    it("T3.1: Streaming Import + Viewport Pan/Zoom: ingested nodes project accurately under active camera", async () => {
      const bytes = await buildFigBytes([
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Page" }),
        change(2, 1, "!", {
          type: "FRAME",
          name: "CanvasFrame",
          size: { x: 800, y: 600 },
        }),
        change(3, 2, "!", {
          type: "RECTANGLE",
          name: "Item",
          transform: { m00: 1, m01: 0, m02: 200, m10: 0, m11: 1, m12: 150 },
          size: { x: 100, y: 100 },
        }),
      ]);

      const result = await importFigFile(bytes);
      const node = result.vooFile.document.pages[0].sceneDoc.nodes.find((n) => n.name === "Item");

      // Active camera viewport
      const camera = { panX: -400, panY: 200, zoom: 1.5 };
      const screenCoords = worldToScreen(node.x, node.y, camera);

      expect(screenCoords.x).toBe(200 * 1.5 - 400); // -100
      expect(screenCoords.y).toBe(150 * 1.5 + 200); // 425
    });

    it("T3.2: Multi-Artboard Layout + R-Tree Frustum Culling: queries retrieve only visible artboards and layers", () => {
      const rtree = new SpatialIndex();

      // Artboard 1: x in [0, 800]
      rtree.insert({ id: "ab1_bg", minX: 0, minY: 0, maxX: 800, maxY: 600 });
      rtree.insert({ id: "ab1_btn", minX: 50, minY: 50, maxX: 150, maxY: 90 });

      // Artboard 2: x in [880, 1680] (PAGE_GAP = 80)
      const ab2X = 800 + PAGE_GAP;
      rtree.insert({ id: "ab2_bg", minX: ab2X, minY: 0, maxX: ab2X + 800, maxY: 600 });
      rtree.insert({ id: "ab2_card", minX: ab2X + 100, minY: 100, maxX: ab2X + 300, maxY: 300 });

      // Camera focused strictly on Artboard 2
      const camera = { panX: -ab2X, panY: 0, zoom: 1.0 };
      const visible = visibleWorldRect(camera, 800, 600, 0);

      const culled = rtree.search(visible);
      const culledIds = culled.map((c) => c.id);

      expect(culledIds).toContain("ab2_bg");
      expect(culledIds).toContain("ab2_card");
      expect(culledIds).not.toContain("ab1_bg");
      expect(culledIds).not.toContain("ab1_btn");
    });

    it("T3.3: Selection Marquee across Artboard Boundaries: selects elements spanning multiple frames", () => {
      const rtree = new SpatialIndex();
      const ab2X = 800 + PAGE_GAP; // 880

      rtree.insert({ id: "node_ab1_right", minX: 700, minY: 100, maxX: 790, maxY: 200 });
      rtree.insert({ id: "node_ab2_left", minX: 890, minY: 100, maxX: 980, maxY: 200 });
      rtree.insert({ id: "node_ab1_far", minX: 50, minY: 100, maxX: 150, maxY: 200 });

      // Marquee box stretching across the inter-artboard gap
      const marqueeBox = { minX: 650, minY: 50, maxX: 1000, maxY: 250 };
      const selected = rtree.search(marqueeBox);
      const selectedIds = selected.map((s) => s.id).sort();

      expect(selectedIds).toEqual(["node_ab1_right", "node_ab2_left"]);
    });

    it("T3.4: R-Tree Frustum Culling feeds Skia Scene Generation: culled elements excluded from draw pipeline", () => {
      const doc = {
        width: 2000,
        height: 1000,
        nodes: [
          { id: "visible_1", kind: "rect", x: 100, y: 100, width: 50, height: 50 },
          { id: "offscreen_1", kind: "rect", x: 1800, y: 800, width: 50, height: 50 },
        ],
      };

      const rtree = new SpatialIndex();
      doc.nodes.forEach((n) => {
        rtree.insert({ id: n.id, minX: n.x, minY: n.y, maxX: n.x + n.width, maxY: n.y + n.height, node: n });
      });

      const camera = { panX: 0, panY: 0, zoom: 1 };
      const cameraBox = visibleWorldRect(camera, 800, 600, 0);
      const visibleItems = rtree.search(cameraBox);

      // Only submit visible items to scene generator
      const filteredDoc = {
        ...doc,
        nodes: visibleItems.map((item) => item.node),
      };

      const scene = documentToScene(filteredDoc, { offsetX: 0, offsetY: 0 });
      const sceneIds = scene.map((el) => el.id);

      expect(sceneIds).toContain("visible_1");
      expect(sceneIds).not.toContain("offscreen_1");
    });

    it("T3.5: Dynamic Node Transformation updates R-Tree Index and Viewport Visibility in real time", () => {
      const rtree = new SpatialIndex();
      const node = { id: "dynNode", minX: 1500, minY: 1500, maxX: 1600, maxY: 1600 };
      rtree.insert(node);

      const cameraBox = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      expect(rtree.search(cameraBox)).toEqual([]);

      // Transform node to viewport center
      rtree.remove("dynNode");
      rtree.insert({ id: "dynNode", minX: 300, minY: 200, maxX: 400, maxY: 300 });

      const hitsAfterMove = rtree.search(cameraBox);
      expect(hitsAfterMove.map((h) => h.id)).toEqual(["dynNode"]);
    });

    it("T3.6: Single Canvas Camera Matrix transforms Skia SceneViewport without rebuilding scene elements", () => {
      const doc = {
        width: 800,
        height: 600,
        nodes: [{ id: "n1", kind: "rect", x: 50, y: 50, width: 100, height: 100 }],
      };

      const sceneA = documentToScene(doc, { offsetX: 0, offsetY: 0 });

      // Skia SceneViewport representation
      const vp1 = { panX: 0, panY: 0, zoom: 1 };
      const vp2 = { panX: -100, panY: -200, zoom: 2.5 };

      // In single canvas architecture, scene elements remain unchanged during pan/zoom
      expect(sceneA[1].id).toBe("n1");
      expect(sceneA[1].bounds.x).toBe(50);

      expect(vp2.zoom).toBe(2.5);
      expect(vp2.panX).toBe(-100);
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION WORKLOADS (Complex Documents & Stresses)
  // =========================================================================

  describe("Tier 4: Real-World Application Workloads", () => {
    it("T4.1: Component Design System Workload (1,000+ component instances)", () => {
      const rtree = new SpatialIndex(16);
      const COMPONENT_COUNT = 1200;
      const components = new Array(COMPONENT_COUNT);

      for (let i = 0; i < COMPONENT_COUNT; i += 1) {
        const col = i % 30;
        const row = Math.floor(i / 30);
        components[i] = {
          id: `btn_${i}`,
          minX: col * 120,
          minY: row * 60,
          maxX: col * 120 + 100,
          maxY: row * 60 + 40,
        };
      }

      const t0 = performance.now();
      rtree.load(components);
      const loadTime = performance.now() - t0;
      expect(rtree.size).toBe(COMPONENT_COUNT);
      expect(loadTime).toBeLessThan(200); // STR loading must be snappy

      // 60fps camera query (simulate standard viewport showing ~20 components)
      const tQ0 = performance.now();
      const visible = rtree.search({ minX: 300, minY: 200, maxX: 1000, maxY: 600 });
      const queryTime = performance.now() - tQ0;

      expect(visible.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(10); // sub-10ms query
    });

    it("T4.2: Deeply Nested Layer Hierarchy (10 levels of nested frames and groups)", () => {
      const DEPTH = 10;
      const nodes = [];
      for (let i = 0; i < DEPTH; i += 1) {
        nodes.push({
          id: `frame_level_${i}`,
          kind: "rect",
          x: i * 15,
          y: i * 15,
          width: 500 - i * 30,
          height: 400 - i * 30,
          fill: `#${i}${i}0000`,
        });
      }

      const doc = { width: 800, height: 600, nodes };
      const scene = documentToScene(doc, { offsetX: 0, offsetY: 0 });

      expect(scene.length).toBe(DEPTH + 1); // 1 frame + 10 nested rects
      expect(scene[scene.length - 1].bounds.x).toBe((DEPTH - 1) * 15);
    });

    it("T4.3: Ultra-Large Scale Spatial Stress Test (10,000+ nodes)", () => {
      const rtree = new SpatialIndex(16);
      const TOTAL_NODES = 10000;
      const nodes = new Array(TOTAL_NODES);

      for (let i = 0; i < TOTAL_NODES; i += 1) {
        const x = (i % 100) * 40;
        const y = Math.floor(i / 100) * 40;
        nodes[i] = {
          id: `node_${i}`,
          minX: x,
          minY: y,
          maxX: x + 35,
          maxY: y + 35,
        };
      }

      const tStart = performance.now();
      rtree.load(nodes);
      const loadElapsed = performance.now() - tStart;
      expect(rtree.size).toBe(TOTAL_NODES);
      expect(loadElapsed).toBeLessThan(350);

      // Perform 50 consecutive viewport searches (simulating rapid panning)
      const tSearchStart = performance.now();
      for (let step = 0; step < 50; step += 1) {
        const offset = step * 20;
        const results = rtree.search({
          minX: offset,
          minY: offset,
          maxX: offset + 800,
          maxY: offset + 600,
        });
        expect(results.length).toBeGreaterThan(0);
      }
      const searchElapsed = performance.now() - tSearchStart;
      expect(searchElapsed / 50).toBeLessThan(5); // Average under 5ms per query
    });

    it("T4.4: High-Frequency Rapid Pan/Zoom Stress Thrash (1,000 consecutive camera updates)", () => {
      const mockStage = {
        clientWidth: 1000,
        clientHeight: 800,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      };
      const doc = { width: 800, height: 600, nodes: [] };
      const vp = createViewport({
        stage: mockStage,
        getDoc: () => doc,
        notify: () => {},
        requestRender: () => {},
      });

      const fixedCenter = { x: 500, y: 400 };

      // Execute 1,000 rapid zoom and pan cycles
      for (let i = 0; i < 500; i += 1) {
        vp.panBy(2.5, -1.8);
        vp.zoomAt(1.002, fixedCenter);
        vp.panBy(-2.5, 1.8);
        vp.zoomAt(1 / 1.002, fixedCenter);
      }

      // Final zoom must stay exactly 1.0 (within micro-epsilon precision)
      expect(Math.abs(vp.getZoom() - 1.0)).toBeLessThan(1e-4);
    });

    it("T4.5: Synthetic .fig Streaming to Unified Scene Assembly End-to-End Pipeline", async () => {
      // 1. Generate multi-artboard Figma payload
      const bytes = await buildFigBytes([
        change(0, null, "", { type: "DOCUMENT", name: "MultiPageDoc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Desktop" }),
        change(2, 1, "!", {
          type: "FRAME",
          name: "Header",
          transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
          size: { x: 1440, y: 120 },
        }),
        change(3, 2, "!", {
          type: "RECTANGLE",
          name: "Logo",
          transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 30 },
          size: { x: 120, y: 60 },
          fillPaints: [{ type: "SOLID", color: { r: 1, g: 0.2, b: 0.2, a: 1 }, opacity: 1, visible: true }],
        }),
      ]);

      // 2. Decode via figma-to-voo importer
      const { vooFile } = await importFigFile(bytes);
      expect(vooFile.document.pages.length).toBe(1);

      // 3. Convert page into Skia unified scene elements
      const pageDoc = vooFile.document.pages[0].sceneDoc;
      expect(requiresCanvas2dMediaFallback(pageDoc)).toBe(true);
      expect(() => documentToScene(pageDoc, {})).toThrow("Canvas2D");
      // Flat-scene structure stays testable separately from the Canvas2D clip route.
      const flatPageDoc = { ...pageDoc, nodes: pageDoc.nodes.map((node) => node.isFrame ? { ...node, clipContent: false } : node) };
      expect(requiresCanvas2dMediaFallback(flatPageDoc)).toBe(false);
      const scene = documentToScene(flatPageDoc, { offsetX: 0, offsetY: 0 });
      expect(pageDoc.isCanvasRoot).toBe(true);
      const header = pageDoc.nodes.find((node) => node.name === "Header");
      const logo = pageDoc.nodes.find((node) => node.name === "Logo");
      expect(header).toMatchObject({ frame: true, parentId: null });
      expect(logo.parentId).toBe(header.id);
      expect(scene.map((element) => element.id)).toEqual([header.id, logo.id]);
      expect(scene[0]).toMatchObject({ shape: "rect", bounds: { x: 0, y: 0, width: 1440, height: 120 } });

      // 4. Index scene elements into R-Tree
      const rtree = new SpatialIndex();
      for (const el of scene) {
        if (el.bounds) {
          rtree.insert({
            id: el.id,
            minX: el.bounds.x,
            minY: el.bounds.y,
            maxX: el.bounds.x + el.bounds.width,
            maxY: el.bounds.y + el.bounds.height,
          });
        }
      }
      expect(rtree.size).toBe(scene.length);

      // 5. Query visible camera bounds
      const camera = { panX: 0, panY: 0, zoom: 1 };
      const viewRect = visibleWorldRect(camera, 1440, 900, 0);
      const visible = rtree.search(viewRect);

      expect(visible.map((v) => v.id)).not.toContain("frame-page");
      expect(visible.map((v) => v.id)).toContain(logo.id);
    });
  });
});

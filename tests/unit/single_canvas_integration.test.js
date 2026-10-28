import { describe, it, expect } from "vitest";
import {
  worldToScreen,
  createCameraMatrixTransformer,
} from "../../src/canvas/editor/editor_pointer_pan_zoom.js";
import {
  documentsToScene,
  PAGE_GAP,
} from "../../src/canvas/editor/skia_scene_adapter.js";
import { SpatialIndex } from "../../src/canvas/editor/spatial_index.js";
import {
  visibleWorldRect,
} from "../../src/canvas/editor/viewport_culling.js";

describe("Milestone 3: Unified Single Canvas & Viewport Architecture", () => {
  // =========================================================================
  // 2. Artboard Frame Hierarchy in Unified Scene Graph
  // =========================================================================
  describe("2. Artboard Frame Hierarchy in Unified Scene Graph", () => {
    it("M3.4: maps multiple artboards to top-level SceneFrame elements with matrix offsets", () => {
      const artboards = [
        {
          id: "page_home",
          title: "Home",
          width: 1440,
          height: 900,
          backgroundColor: "#ffffff",
          nodes: [
            { id: "hero_title", kind: "text", x: 80, y: 120, width: 400, height: 60 },
            { id: "hero_btn", kind: "rect", x: 80, y: 220, width: 180, height: 48 },
          ],
        },
        {
          id: "page_checkout",
          title: "Checkout",
          width: 375,
          height: 812,
          backgroundColor: "#f5f5f5",
          nodes: [
            { id: "nav_bar", kind: "rect", x: 0, y: 0, width: 375, height: 64 },
            { id: "pay_btn", kind: "rect", x: 20, y: 700, width: 335, height: 50 },
          ],
        },
      ];

      const layouts = new Map([
        ["page_home", { x: 100, y: 200, width: 1440, height: 900 }],
        ["page_checkout", { x: 1700, y: 200, width: 375, height: 812 }],
      ]);

      const scene = documentsToScene(artboards, { layouts });

      // Verify Frame 1
      const frameHome = scene.find((el) => el.id === "frame-page_home");
      expect(frameHome).toBeDefined();
      expect(frameHome.kind).toBe("frame");
      expect(frameHome.title).toBe("Home");
      expect(frameHome.clipContent).toBe(true);
      expect(frameHome.bounds).toEqual({ x: 100, y: 200, width: 1440, height: 900 });

      // Verify Frame 1 children offsets and parentId hierarchy
      const heroTitle = scene.find((el) => el.id === "hero_title");
      expect(heroTitle).toBeDefined();
      expect(heroTitle.bounds.x).toBe(100 + 80);
      expect(heroTitle.bounds.y).toBe(200 + 120);
      expect(heroTitle.parentId).toBe("frame-page_home");

      const heroBtn = scene.find((el) => el.id === "hero_btn");
      expect(heroBtn).toBeDefined();
      expect(heroBtn.bounds.x).toBe(100 + 80);
      expect(heroBtn.bounds.y).toBe(200 + 220);
      expect(heroBtn.parentId).toBe("frame-page_home");

      // Verify Frame 2
      const frameCheckout = scene.find((el) => el.id === "frame-page_checkout");
      expect(frameCheckout).toBeDefined();
      expect(frameCheckout.kind).toBe("frame");
      expect(frameCheckout.clipContent).toBe(true);
      expect(frameCheckout.bounds).toEqual({ x: 1700, y: 200, width: 375, height: 812 });

      // Verify Frame 2 children offsets and parentId hierarchy
      const payBtn = scene.find((el) => el.id === "pay_btn");
      expect(payBtn).toBeDefined();
      expect(payBtn.bounds.x).toBe(1700 + 20);
      expect(payBtn.bounds.y).toBe(200 + 700);
      expect(payBtn.parentId).toBe("frame-page_checkout");
    });

    it("M3.5: handles default sequential axis layout with PAGE_GAP when no explicit layouts provided", () => {
      const docs = [
        { id: "ab1", width: 800, height: 600, nodes: [] },
        { id: "ab2", width: 800, height: 600, nodes: [] },
        { id: "ab3", width: 800, height: 600, nodes: [] },
      ];

      const sceneH = documentsToScene(docs, { axis: "horizontal" });
      const f1 = sceneH.find((el) => el.id === "frame-ab1");
      const f2 = sceneH.find((el) => el.id === "frame-ab2");
      const f3 = sceneH.find((el) => el.id === "frame-ab3");

      expect(f1.bounds.x).toBe(0);
      expect(f2.bounds.x).toBe(800 + PAGE_GAP);
      expect(f3.bounds.x).toBe((800 + PAGE_GAP) * 2);

      const sceneV = documentsToScene(docs, { axis: "vertical" });
      const f1V = sceneV.find((el) => el.id === "frame-ab1");
      const f2V = sceneV.find((el) => el.id === "frame-ab2");
      const f3V = sceneV.find((el) => el.id === "frame-ab3");

      expect(f1V.bounds.y).toBe(0);
      expect(f2V.bounds.y).toBe(600 + PAGE_GAP);
      expect(f3V.bounds.y).toBe((600 + PAGE_GAP) * 2);
    });
  });

  // =========================================================================
  // 3. Viewport Matrix Pan/Zoom Optimization
  // =========================================================================
  describe("3. Viewport Matrix Pan/Zoom Optimization", () => {
    it("M3.7: applies pan/zoom directly through 3x3 viewport matrix without mutating document nodes", async () => {
      const doc = {
        id: "doc_stable",
        width: 800,
        height: 600,
        nodes: [{ id: "target", kind: "rect", x: 150, y: 250, width: 100, height: 100 }],
      };

      const originalX = doc.nodes[0].x;
      const originalY = doc.nodes[0].y;

      // 100 pan/zoom iterations
      const camera = { panX: 0, panY: 0, zoom: 1.0 };
      for (let step = 0; step < 100; step += 1) {
        camera.panX += 5;
        camera.panY -= 3;
        camera.zoom = 1.0 + (step % 10) * 0.1;

        // Project node to screen
        const screen = worldToScreen(doc.nodes[0].x, doc.nodes[0].y, camera);
        expect(screen.x).toBeCloseTo(150 * camera.zoom + camera.panX, 4);
        expect(screen.y).toBeCloseTo(250 * camera.zoom + camera.panY, 4);
      }

      // Invariant: document node coordinates remain strictly unmodified
      expect(doc.nodes[0].x).toBe(originalX);
      expect(doc.nodes[0].y).toBe(originalY);
    });
  });

  // =========================================================================
  // 4. Unified Pointer Coordinate Transformer
  // =========================================================================
  describe("4. Unified 4-Level Pointer Coordinate Transformer", () => {
    it("M3.8: transforms screen -> world -> frame -> node with exact bidirectionality", () => {
      const camera = { panX: -350, panY: 220, zoom: 1.75 };
      const frameBounds = { x: 500, y: 400, width: 800, height: 600 };
      const transformer = createCameraMatrixTransformer(camera, frameBounds);

      // Simulate a pointer click at screen (850, 650)
      const screenPt = { x: 850, y: 650 };

      // 1. screen -> world
      const worldPt = transformer.screenToWorld(screenPt.x, screenPt.y);
      expect(worldPt.x).toBeCloseTo((850 - (-350)) / 1.75, 6);
      expect(worldPt.y).toBeCloseTo((650 - 220) / 1.75, 6);

      // world -> screen round-trip
      const screenRoundTrip = transformer.worldToScreen(worldPt.x, worldPt.y);
      expect(screenRoundTrip.x).toBeCloseTo(screenPt.x, 6);
      expect(screenRoundTrip.y).toBeCloseTo(screenPt.y, 6);

      // 2. world -> frame
      const framePt = transformer.worldToFrame(worldPt.x, worldPt.y);
      expect(framePt.x).toBeCloseTo(worldPt.x - 500, 6);
      expect(framePt.y).toBeCloseTo(worldPt.y - 400, 6);

      // frame -> world round-trip
      const worldRoundTrip = transformer.frameToWorld(framePt.x, framePt.y);
      expect(worldRoundTrip.x).toBeCloseTo(worldPt.x, 6);
      expect(worldRoundTrip.y).toBeCloseTo(worldPt.y, 6);

      // 3. direct screen -> frame composite
      const directFramePt = transformer.screenToFrame(screenPt.x, screenPt.y);
      expect(directFramePt.x).toBeCloseTo(framePt.x, 6);
      expect(directFramePt.y).toBeCloseTo(framePt.y, 6);

      // direct frame -> screen composite
      const directScreenPt = transformer.frameToScreen(framePt.x, framePt.y);
      expect(directScreenPt.x).toBeCloseTo(screenPt.x, 6);
      expect(directScreenPt.y).toBeCloseTo(screenPt.y, 6);
    });

    it("M3.9: pointer event transformer handles DOM PointerEvent and mock stage rects", () => {
      const camera = { panX: 100, panY: 50, zoom: 2.0 };
      const frameBounds = { x: 200, y: 150 };
      const transformer = createCameraMatrixTransformer(camera, frameBounds);

      const mockStage = {
        getBoundingClientRect: () => ({ left: 50, top: 25 }),
      };

      const mockEvent = { clientX: 450, clientY: 325 };
      const transformed = transformer.transformPointerEvent(mockEvent, mockStage);

      // screen = client - stageOffset = (400, 300)
      expect(transformed.screen).toEqual({ x: 400, y: 300 });

      // world = (screen - pan) / zoom = (400 - 100)/2, (300 - 50)/2 = (150, 125)
      expect(transformed.world.x).toBeCloseTo(150, 6);
      expect(transformed.world.y).toBeCloseTo(125, 6);

      // frame = world - frameOffset = (150 - 200), (125 - 150) = (-50, -25)
      expect(transformed.frame.x).toBeCloseTo(-50, 6);
      expect(transformed.frame.y).toBeCloseTo(-25, 6);
    });
  });

  // =========================================================================
  // 5. R-Tree Frustum Culling in Render Loop
  // =========================================================================
  describe("5. R-Tree Frustum Culling in Render Loop", () => {
    it("M3.10: culls off-screen artboards and elements when camera views a specific viewport window", () => {
      // 3 Artboards spaced along X
      const artboardA = {
        id: "ab_A",
        width: 1000,
        height: 800,
        nodes: [
          { id: "node_A1", kind: "rect", x: 100, y: 100, width: 200, height: 100 },
          { id: "node_A2", kind: "rect", x: 400, y: 400, width: 200, height: 100 },
        ],
      };
      const artboardB = {
        id: "ab_B",
        width: 1000,
        height: 800,
        nodes: [
          { id: "node_B1", kind: "rect", x: 100, y: 100, width: 200, height: 100 },
        ],
      };
      const artboardC = {
        id: "ab_C",
        width: 1000,
        height: 800,
        nodes: [
          { id: "node_C1", kind: "rect", x: 100, y: 100, width: 200, height: 100 },
        ],
      };

      const layouts = new Map([
        ["ab_A", { x: 0, y: 0, width: 1000, height: 800 }],
        ["ab_B", { x: 2000, y: 0, width: 1000, height: 800 }],
        ["ab_C", { x: 4000, y: 0, width: 1000, height: 800 }],
      ]);

      // Camera focused strictly on Artboard B (panX = -2000, panY = 0, zoom = 1)
      const camera = { panX: -2000, panY: 0, zoom: 1.0 };
      const visibleRect = visibleWorldRect(camera, 1200, 900, 50);

      // Artboard B is in view; Artboards A and C are completely off-screen
      const scene = documentsToScene([artboardA, artboardB, artboardC], {
        layouts,
        visibleRect,
      });

      const elementIds = scene.map((el) => el.id);

      // Artboard B elements are drawn
      expect(elementIds).toContain("frame-ab_B");
      expect(elementIds).toContain("node_B1");

      // Off-screen artboards A and C children are culled from draw list
      expect(elementIds).not.toContain("node_A1");
      expect(elementIds).not.toContain("node_A2");
      expect(elementIds).not.toContain("node_C1");
    });

    it("M3.11: connects SpatialIndex search directly to documentsToScene frustum pipeline", () => {
      const spatialIndex = new SpatialIndex();

      const doc = {
        id: "ab_spatial",
        width: 3000,
        height: 2000,
        nodes: [
          { id: "n_visible", kind: "rect", x: 200, y: 200, width: 100, height: 100 },
          { id: "n_far_away", kind: "rect", x: 2800, y: 1800, width: 100, height: 100 },
        ],
      };

      // Populate spatial index in world coordinates
      spatialIndex.insert({ id: "n_visible", minX: 200, minY: 200, maxX: 300, maxY: 300 });
      spatialIndex.insert({ id: "n_far_away", minX: 2800, minY: 1800, maxX: 2900, maxY: 1900 });

      // Viewport viewing only the top-left region [0, 800]
      const visibleRect = { minX: 0, minY: 0, maxX: 800, maxY: 600 };

      const scene = documentsToScene([doc], {
        spatialIndex,
        visibleRect,
      });

      const sceneIds = scene.map((s) => s.id);
      expect(sceneIds).toContain("n_visible");
      expect(sceneIds).not.toContain("n_far_away");
    });
  });
});

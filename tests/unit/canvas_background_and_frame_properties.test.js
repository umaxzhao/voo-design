import { describe, it, expect, vi } from "vitest";
import { buildVisibleTreeItems } from "../../src/canvas/components/editor_canvas_tree_items.js";
import { createEngineDocumentController } from "../../src/canvas/editor/editor_engine_document.js";
import { supportsColour } from "../../src/canvas/editor/scene_model_serialization.js";

describe("Overall Canvas Background & Frame Properties", () => {
  it("places the canvas background at the very bottom of the tree, not inside any frame", () => {
    const page1 = {
      id: "page-1",
      title: "Design 1",
      type: "design",
      nodes: [
        { id: "rect-1", kind: "rect", name: "Rectangle 1" },
        { id: "text-1", kind: "text", name: "Text 1" },
      ],
    };
    const activeRows = [
      { node: page1.nodes[0], index: 0, depth: 0 },
      { node: page1.nodes[1], index: 1, depth: 0 },
    ];

    const items = buildVisibleTreeItems({
      canvasPages: [page1],
      activeCanvasId: "page-1",
      activeRows,
      showBackgroundRow: true,
    });

    // Structure should be:
    // 0: canvas-page-1
    // 1: layer-page-1-rect-1
    // 2: layer-page-1-text-1
    // 3: canvas-background (at the very bottom)
    expect(items.length).toBe(4);
    expect(items[0].key).toBe("canvas-page-1");
    expect(items[1].key).toBe("layer-page-1-rect-1");
    expect(items[2].key).toBe("layer-page-1-text-1");
    expect(items[3].key).toBe("canvas-background");
    expect(items[3].domId).toBe("layer-row-canvas-background");
    expect(items[3].depth).toBe(0);

    // Verify no background item is nested inside page-1
    const pageChildren = items.filter(
      (item) => item.canvasId === "page-1" && item.type === "background",
    );
    expect(pageChildren.length).toBe(0);
  });

  it("updates document properties via engineDocumentController.updateDocument", () => {
    let doc = {
      width: 800,
      height: 600,
      backgroundColor: "#171717",
      nodes: [],
    };
    const notify = vi.fn();
    const ctrl = createEngineDocumentController({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      crop: {
        beginCrop: vi.fn(),
        applyCrop: vi.fn(),
        applyDestructiveCrop: vi.fn(),
        cancelCrop: vi.fn(),
        resetCrop: vi.fn(),
        isImageCrop: vi.fn(),
        isCropActive: vi.fn(),
        getCropSize: vi.fn(),
        setCropSize: vi.fn(),
        getCropAngle: vi.fn(),
        setCropAngle: vi.fn(),
      },
      viewportTools: {
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        setViewport: vi.fn(),
        zoomToFit: vi.fn(),
      },
      cameraMode: "shared",
      requestRender: vi.fn(),
      notify,
    });

    ctrl.updateDocument({
      cornerRadius: 12,
      stroke: "#333333",
      strokeWidth: 2,
      rotation: 45,
    });

    expect(doc.cornerRadius).toBe(12);
    expect(doc.stroke).toBe("#333333");
    expect(doc.strokeWidth).toBe(2);
    expect(doc.rotation).toBe(45);
  });

  it("ensures frame objects support colour for Fill and Stroke sections", () => {
    const frameObject = {
      id: "frame-1",
      kind: "rect",
      isFrame: true,
      fill: "#171717",
      stroke: "#ffffff",
    };
    expect(supportsColour(frameObject)).toBe(true);
  });
});

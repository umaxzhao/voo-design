import { describe, it, expect, vi } from "vitest";
import { createEngineDocumentController } from "../../src/canvas/editor/editor_engine_document.js";

describe("Engine Snapping Controller", () => {
  function setupTestController() {
    let doc = { width: 800, height: 600, nodes: [], guides: [] };
    const notify = vi.fn();
    const requestRender = vi.fn();
    const viewportTools = {
      getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
      setViewport: vi.fn(),
      zoomToFit: vi.fn(),
    };
    const crop = {};

    const controller = createEngineDocumentController({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      crop,
      viewportTools,
      cameraMode: "page",
      requestRender,
      notify,
    });

    return { controller, notify };
  }

  it("defaults snappingEnabled to true", () => {
    const { controller } = setupTestController();
    expect(controller.getSnappingEnabled()).toBe(true);
  });

  it("can set snapping enabled state and notify listeners", () => {
    const { controller, notify } = setupTestController();
    controller.setSnappingEnabled(false);
    expect(controller.getSnappingEnabled()).toBe(false);
    expect(notify).toHaveBeenCalled();

    controller.setSnappingEnabled(true);
    expect(controller.getSnappingEnabled()).toBe(true);
  });

  it("can toggle snapping state cleanly", () => {
    const { controller, notify } = setupTestController();
    expect(controller.getSnappingEnabled()).toBe(true);

    const firstToggle = controller.toggleSnapping();
    expect(firstToggle).toBe(false);
    expect(controller.getSnappingEnabled()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);

    const secondToggle = controller.toggleSnapping();
    expect(secondToggle).toBe(true);
    expect(controller.getSnappingEnabled()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

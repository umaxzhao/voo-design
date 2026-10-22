import { describe, it, expect } from "vitest";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";

describe("Navigation Ergonomics (Figma & Photoshop Parity)", () => {
  it("zoomAt zooms centered around the cursor position", () => {
    let notified = false;
    let rendered = false;
    const stage = { clientWidth: 1000, clientHeight: 800, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const vp = createViewport({
      stage,
      getDoc: () => ({ width: 800, height: 600 }),
      notify: () => { notified = true; },
      requestRender: () => { rendered = true; },
    });

    expect(vp.getZoom()).toBe(1);
    expect(vp.getViewport().panX).toBe(0);

    // Zoom 2x anchored at cursor (500, 400)
    vp.zoomAt(2, { x: 500, y: 400 });

    expect(vp.getZoom()).toBe(2);
    // At cursor point: panX = 500 - (500 - 0)*2 = 500 - 1000 = -500
    expect(vp.getViewport().panX).toBe(-500);
    expect(vp.getViewport().panY).toBe(-400);
    expect(notified).toBe(true);
    expect(rendered).toBe(true);
  });

  it("panBy smoothly translates viewport coordinates", () => {
    const stage = { clientWidth: 1000, clientHeight: 800, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const vp = createViewport({
      stage,
      getDoc: () => ({ width: 800, height: 600 }),
      notify: () => {},
      requestRender: () => {},
    });

    vp.panBy(50, -30);
    expect(vp.getViewport().panX).toBe(50);
    expect(vp.getViewport().panY).toBe(-30);
  });

  it("zoomToHundred resets zoom to 1 while centering on stage", () => {
    const stage = { clientWidth: 1000, clientHeight: 800, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const vp = createViewport({
      stage,
      getDoc: () => ({ width: 800, height: 600 }),
      notify: () => {},
      requestRender: () => {},
    });

    vp.zoomAt(3, { x: 200, y: 200 });
    expect(vp.getZoom()).toBe(3);

    vp.zoomToHundred();
    expect(vp.getZoom()).toBe(1);
  });

  it("zoomToSelection computes tight bounding box and centers viewport on selection", () => {
    const stage = { clientWidth: 1000, clientHeight: 800, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const vp = createViewport({
      stage,
      getDoc: () => ({ width: 2000, height: 2000 }),
      notify: () => {},
      requestRender: () => {},
    });

    const selectedNodes = [
      { id: "node1", x: 200, y: 100, width: 100, height: 100 },
      { id: "node2", x: 400, y: 300, width: 200, height: 150 },
    ];
    // Combined selection: x=200 to 600 (w=400), y=100 to 450 (h=350)

    vp.zoomToSelection(selectedNodes);
    expect(vp.getZoom()).toBeGreaterThan(1);
    expect(vp.getViewport().zoom).toBeLessThan(5);
  });

  it("panEditorCamera supports both positional arguments (dx, dy) and object ({ dx, dy })", async () => {
    const { default: useDesignStore } = await import("../../src/store/design_store.js");
    useDesignStore.setState({
      editorCamera: { zoom: 1, panX: 0, panY: 0 },
    });

    // Test object argument
    useDesignStore.getState().panEditorCamera({ dx: 25, dy: 15 });
    expect(useDesignStore.getState().editorCamera.panX).toBe(25);
    expect(useDesignStore.getState().editorCamera.panY).toBe(15);

    // Test positional arguments (from pointer / wheel gestures)
    useDesignStore.getState().panEditorCamera(-10, 20);
    expect(useDesignStore.getState().editorCamera.panX).toBe(15);
    expect(useDesignStore.getState().editorCamera.panY).toBe(35);
  });
});

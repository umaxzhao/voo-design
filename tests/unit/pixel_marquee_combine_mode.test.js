import { describe, expect, it, vi } from "vitest";
import { createMarqueePointerGestures } from "../../src/canvas/editor/editor_pointer_marquee.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

// One 96×96 visible, unlocked image at the document origin.
const HOST = {
  id: "host",
  kind: NODE_KIND.IMAGE,
  x: 0,
  y: 0,
  width: 96,
  height: 96,
  visible: true,
  locked: false,
  lockImagePixels: false,
};
// Existing pixel selection: rectangle 8..48 × 8..72 (contour is the same).
const EXISTING = {
  contours: [
    [
      [8, 8],
      [48, 8],
      [48, 72],
      [8, 72],
    ],
  ],
};

function makeHarness({ mode = "replace", marqueeMode = "rect" } = {}) {
  let gesture = null;
  const api = {
    toDocPoint: (x, y) => ({ x, y }),
    getPixelSelection: () => EXISTING,
    getSelected: () => HOST,
    getDocument: () => ({ nodes: [HOST] }),
    getSelectionMode: () => mode,
    getMarqueeMode: () => marqueeMode,
    clearPixelSelection: vi.fn(),
  };
  const inside = (contours, point) =>
    point.x >= 8 && point.x <= 48 && point.y >= 8 && point.y <= 72;
  const gestures = createMarqueePointerGestures({
    api,
    imageAt: () => HOST,
    pointInContours: inside,
    getGesture: () => gesture,
    setGesture: (next) => {
      gesture = next;
    },
  });
  return { gestures, getGesture: () => gesture, api };
}

const at = (x, y, modifiers = {}) => ({
  clientX: x,
  clientY: y,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe("pixel marquee start honours the toolbar combine mode", () => {
  it("replace mode: pressing inside the existing selection moves it", () => {
    const { gestures, getGesture } = makeHarness({ mode: "replace" });
    gestures.startPixelMarquee(at(28, 8));
    expect(getGesture().kind).toBe("selectionOutlineMove");
  });

  it("subtract mode from the toolbar: pressing on the selection edge starts a subtract marquee, not a move", () => {
    const { gestures, getGesture } = makeHarness({ mode: "subtract" });
    gestures.startPixelMarquee(at(28, 8));
    expect(getGesture().kind).toBe("pixelMarquee");
    expect(getGesture().mode).toBe("subtract");
    expect(getGesture().baseSelection).toBe(EXISTING);
  });

  it("union and intersect toolbar modes also do not move the selection on press", () => {
    for (const mode of ["union", "intersect"]) {
      const { gestures, getGesture } = makeHarness({ mode });
      gestures.startPixelMarquee(at(28, 8));
      expect(getGesture().kind, mode).toBe("pixelMarquee");
      expect(getGesture().mode, mode).toBe(mode);
    }
  });

  it("Alt in replace mode still subtracts (modifier path unchanged)", () => {
    const { gestures, getGesture } = makeHarness({ mode: "replace" });
    gestures.startPixelMarquee(at(28, 8, { altKey: true }));
    expect(getGesture().kind).toBe("pixelMarquee");
    expect(getGesture().mode).toBe("subtract");
  });

  it("Shift+Alt in replace mode intersects (modifier path unchanged)", () => {
    const { gestures, getGesture } = makeHarness({ mode: "replace" });
    gestures.startPixelMarquee(at(28, 8, { altKey: true, shiftKey: true }));
    expect(getGesture().mode).toBe("intersect");
  });

  it("subtract mode started outside the selection starts a subtract marquee", () => {
    const { gestures, getGesture } = makeHarness({ mode: "subtract" });
    gestures.startPixelMarquee(at(80, 80));
    expect(getGesture().kind).toBe("pixelMarquee");
    expect(getGesture().mode).toBe("subtract");
  });

  it("lasso in subtract mode from inside the selection also does not move it", () => {
    const { gestures, getGesture } = makeHarness({
      mode: "subtract",
      marqueeMode: "lasso",
    });
    gestures.startPixelMarquee(at(28, 8));
    expect(getGesture().kind).toBe("pixelLasso");
    expect(getGesture().mode).toBe("subtract");
  });
});

import { describe, expect, it } from "vitest";
import { createPaintStroke } from "../../src/canvas/editor/editor_paint_stroke.js";
import { createDrawingPointerGestures } from "../../src/canvas/editor/editor_pointer_drawing.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

const BRUSH_SIZE = 40;
const BRUSH_OPACITY = 0.8;

/** Wires the real pointer gestures to the real stroke engine over a plain picture layer. */
function createHarness({ pressureSize = false, pressureOpacity = false } = {}) {
  const node = {
    id: "layer-1",
    kind: NODE_KIND.IMAGE,
    x: 0,
    y: 0,
    width: 400,
    height: 400,
  };
  const doc = { nodes: [node] };
  const canvas = { width: 400, height: 400, getContext: () => ({}) };
  const stroke = createPaintStroke({
    getDoc: () => doc,
    setDoc: () => {},
    select: () => {},
    selection: { getId: () => node.id },
    requestRender: () => {},
    paintCanvases: new Map(),
    paintCanvasOf: () => canvas,
    releaseBitmap: () => {},
    markPaintDirty: () => {},
    queuePaintPersist: () => Promise.resolve(),
  });
  const api = {
    ...stroke,
    toDocPoint: (x, y) => ({ x, y }),
    getBrushWidth: () => BRUSH_SIZE,
    getBrushHardness: () => 1,
    getColor: () => "#000000",
    getBrushOpacity: () => BRUSH_OPACITY,
    getPressureSize: () => pressureSize,
    getPressureOpacity: () => pressureOpacity,
  };
  const gestures = createDrawingPointerGestures({
    api,
    imageAt: () => node,
    getGesture: () => null,
    setGesture: () => {},
    getLastBrushPoint: () => null,
    setLastBrushPoint: () => {},
  });
  return { gestures, stroke };
}

/** Starts a brush stroke and returns the first dab's diameter and opacity. */
function dab(pointerType, pressure, toggles) {
  const { gestures, stroke } = createHarness(toggles);
  gestures.startBrush({ clientX: 100, clientY: 100, pointerType, pressure });
  const { pendingDiameter, stampOpacity } = stroke.getPaintEdit();
  return { diameter: pendingDiameter, opacity: stampOpacity };
}

describe("pen pressure on the brush", () => {
  it("scales a pen stroke by pressure with both toggles off", () => {
    const light = dab("pen", 0.2);
    const heavy = dab("pen", 1);

    expect(heavy.diameter).toBeGreaterThan(light.diameter);
    expect(heavy.opacity).toBeGreaterThan(light.opacity);
  });

  it("leaves a mouse stroke at the stable brush size and opacity", () => {
    const mouse = dab("mouse", 0.5);

    expect(mouse.diameter).toBe(BRUSH_SIZE);
    expect(mouse.opacity).toBe(BRUSH_OPACITY);
  });

  it("leaves a touch stroke untouched with the toggles off", () => {
    const touch = dab("touch", 1);

    expect(touch.diameter).toBe(BRUSH_SIZE);
    expect(touch.opacity).toBe(BRUSH_OPACITY);
  });

  it("still lets the size toggle scale a mouse stroke", () => {
    const flat = dab("mouse", 0.5);
    const scaled = dab("mouse", 0.5, { pressureSize: true });

    expect(scaled.diameter).toBeLessThan(flat.diameter);
    expect(scaled.opacity).toBe(BRUSH_OPACITY);
  });
});

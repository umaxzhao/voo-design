import { afterEach, describe, expect, it, vi } from "vitest";
import { createSelectionPaintEffects } from "../../src/canvas/editor/selection_effects_paint.js";

// Regression: dragging the Gradient tool over an image layer threw
// "Cannot read properties of undefined (reading 'x')" because the drag path
// dropped node/scale when building geometry.
describe("gradient tool drag", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the drag vector into the layer's pixel space", async () => {
    const calls = [];
    const ctx = {
      drawImage() {},
      createLinearGradient: (...a) => { calls.push(a); return { addColorStop() {} }; },
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      save() {}, restore() {},
    };
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ctx, toDataURL: () => "data:image/png;base64," }),
    });
    const node = { id: "img", kind: "image", x: 100, y: 50, width: 200, height: 100 };
    const replaceNodeBitmap = vi.fn(async () => {});
    const fx = createSelectionPaintEffects({
      getDoc: () => ({ nodes: [node] }),
      cache: { get: () => ({ width: 400, height: 200 }) },
      getColor: () => "#000000",
      getBackgroundColor: () => "#ffffff",
      selection: { getId: () => "img" },
      getPixelSelection: () => null,
      replaceNodeBitmap,
      requestRender() {}, notify() {},
    });
    const ok = await fx.applyGradientSelection({ x: 100, y: 50 }, { x: 200, y: 100 }, "#000000", "#ffffff");
    expect(ok).toBe(true);
    expect(replaceNodeBitmap).toHaveBeenCalledOnce();
    expect(calls[0]).toEqual([0, 0, 200, 100]);
  });
});

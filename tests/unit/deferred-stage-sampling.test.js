import { expect, it, vi } from "vitest";
import { createEngineSampler } from "../../src/canvas/editor/editor_engine_sampling.js";

it("refreshes deferred stage pixels before the eyedropper reads them", () => {
  let pixel = [0, 0, 0, 0];
  const beforeRead = vi.fn(() => { pixel = [18, 52, 86, 255]; });
  const getImageData = vi.fn(() => ({ data: Uint8ClampedArray.from(pixel) }));
  const sampler = createEngineSampler({
    ctx: { canvas: { width: 100, height: 100 }, getImageData },
    getDoc: () => ({ nodes: [] }),
    viewportTools: { getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }) },
    getRenderedDpr: () => 1, DROPPER_SAMPLE_RADII: { 0: 0 }, beforeRead,
  });
  expect(sampler.sampleColorAt({ x: 20, y: 30 })).toBe("#123456");
  expect(beforeRead).toHaveBeenCalledOnce();
  expect(getImageData).toHaveBeenCalledWith(20, 30, 1, 1);
});

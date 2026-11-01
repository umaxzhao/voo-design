import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArtworkPicture } from "../../src/canvas/editor/workspace-artwork-picture.js";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", { devicePixelRatio: 1 }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  const surfaces = [];
  const context = () => ({ save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() });
  const ownerDocument = { createElement() {
    const ctx = context(), element = { width: 0, height: 0, ownerDocument, getContext: () => ctx };
    surfaces.push(element); return element;
  } };
  const ctx = context();
  const canvas = { width: 1000, height: 800, dataset: {}, ownerDocument, getContext: () => ctx };
  let stamp = {};
  const engine = { getDocument: () => ({ nodes: Array.from({ length: 600 }, (_, i) => ({ id: String(i) })) }),
    getArtworkStamp: () => stamp, renderLayerPass: vi.fn((target, ids, surface) => {
      target.width = Math.round(surface.stageWidth * window.devicePixelRatio);
      target.height = Math.round(surface.stageHeight * window.devicePixelRatio);
    }) };
  const surface = { stageWidth: 1000, stageHeight: 800, viewport: { zoom: 1, panX: 100, panY: 60 } };
  return { canvas, ctx, engine, surface, surfaces, invalidate: () => { stamp = {}; } };
}

describe("bounded workspace zoom pictures", () => {
  it("reuses covered motion, debounces refinement, and paints the latest exact viewport", () => {
    const f = fixture(), picture = createArtworkPicture(f.canvas, f.engine);
    picture.paint(f.surface);
    vi.advanceTimersByTime(160);
    expect(f.canvas.dataset.artworkWarm).toBe("true");
    const paints = f.engine.renderLayerPass.mock.calls.length;
    const next = { ...f.surface, viewport: { zoom: 1.1, panX: 110, panY: 66 } };
    picture.paint(next);
    expect(f.canvas.dataset.artworkState).toBe("preview");
    expect(f.engine.renderLayerPass).toHaveBeenCalledTimes(paints);
    expect(f.ctx.setTransform).toHaveBeenLastCalledWith(1.1, 0, 0, 1.1, -176, -176.00000000000003);
    vi.advanceTimersByTime(100);
    const latest = { ...next, viewport: { ...next.viewport, zoom: 1.12 } };
    picture.paint(latest);
    vi.advanceTimersByTime(100);
    expect(f.canvas.dataset.artworkState).toBe("preview");
    vi.advanceTimersByTime(60);
    expect(f.canvas.dataset.artworkState).toBe("exact");
    expect(f.engine.renderLayerPass).toHaveBeenLastCalledWith(f.canvas, expect.any(Array), latest);
    picture.dispose();
  });

  it("never reuses uncovered pixels, changed assets or a resized surface", () => {
    const f = fixture(), picture = createArtworkPicture(f.canvas, f.engine);
    picture.paint(f.surface); vi.advanceTimersByTime(160);
    picture.paint({ ...f.surface, viewport: { ...f.surface.viewport, zoom: .2 } });
    expect(f.canvas.dataset.artworkState).toBe("exact");
    f.invalidate(); picture.paint(f.surface);
    expect(f.canvas.dataset.artworkState).toBe("exact");
    picture.paint({ ...f.surface, stageWidth: 1100 });
    expect(f.canvas.width).toBe(1100);
    picture.dispose();
  });

  it("flushes readback synchronously and releases timers and picture allocations", () => {
    const f = fixture(), picture = createArtworkPicture(f.canvas, f.engine);
    picture.paint(f.surface); vi.advanceTimersByTime(160);
    const next = { ...f.surface, viewport: { ...f.surface.viewport, zoom: 1.04 } };
    picture.paint(next); picture.paint(next, true);
    expect(f.canvas.dataset.artworkState).toBe("exact");
    const count = f.engine.renderLayerPass.mock.calls.length;
    picture.dispose(); vi.runAllTimers(); picture.paint(next);
    expect(f.engine.renderLayerPass).toHaveBeenCalledTimes(count);
    expect(f.surfaces.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it("does not allocate a second oversized canvas beyond its memory budget", () => {
    const f = fixture(), picture = createArtworkPicture(f.canvas, f.engine);
    picture.paint({ ...f.surface, stageWidth: 5000, stageHeight: 5000 });
    vi.runAllTimers();
    expect(f.surfaces).toHaveLength(0);
    expect(f.canvas.dataset.artworkState).toBe("exact");
    picture.dispose();
  });

  it("retains motion previews at fractional device scales without resampling exact pixels", () => {
    window.devicePixelRatio = 1.25;
    const f = fixture(), picture = createArtworkPicture(f.canvas, f.engine);
    f.surface.stageWidth = 1001;
    picture.paint(f.surface); vi.advanceTimersByTime(160);
    picture.paint({ ...f.surface, viewport: { ...f.surface.viewport, zoom: 1.04 } });
    expect(f.canvas.dataset.artworkState).toBe("preview");
    picture.dispose();
  });
});

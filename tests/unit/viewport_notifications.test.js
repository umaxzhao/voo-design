import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";
import { createRectNode } from "../../src/canvas/editor/scene_model.js";
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", callback => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", id => clearTimeout(id));
});
afterEach(() => vi.unstubAllGlobals());
it("defers plain-document UI during camera motion and publishes final camera", () => {
  vi.useFakeTimers();
  try {
    const notify = vi.fn(), requestRender = vi.fn();
    const viewport = createViewport({ stage: {}, getDoc: () => ({ nodes: [createRectNode({})] }), notify, requestRender });
    viewport.panBy(1, 2);
    vi.advanceTimersByTime(100);
    viewport.panBy(3, 4);
    expect(notify).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(416);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(viewport.getViewport()).toMatchObject({ panX: 4, panY: 6 });
  } finally { vi.useRealTimers(); }
});
it("keeps mixed/DOM document notifications live", () => {
  vi.useFakeTimers();
  try {
    const notify = vi.fn();
    const viewport = createViewport({ stage: {}, getDoc: () => ({ nodes: [{ kind: "canvasInstance" }] }), notify, requestRender: () => {} });
    viewport.panBy(1, 2);
    expect(notify).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(416);
    expect(notify).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it("does not settle between slow gesture frames and cancels pending work on dispose", () => {
  vi.useFakeTimers();
  try {
    const notify = vi.fn(), requestRender = vi.fn();
    const viewport = createViewport({ stage: {}, getDoc: () => ({ nodes: [createRectNode({})] }), notify, requestRender });
    viewport.panBy(1, 0);
    vi.advanceTimersByTime(400); // timer elapsed, next animation frame still pending
    expect(viewport.isMoving()).toBe(true);
    viewport.zoomAt(1.02, { x: 100, y: 100 });
    vi.advanceTimersByTime(16);
    expect(viewport.isMoving()).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    viewport.dispose();
    vi.runAllTimers();
    expect(notify).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

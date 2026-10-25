// The viewport's settle callback must survive headless runs (no rAF), which is
// where the late-settle ReferenceError used to surface as an uncaught error.
import { afterEach, it, expect, vi } from "vitest";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";
import { createRectNode } from "../../src/canvas/editor/scene_model.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("settles through a macrotask when requestAnimationFrame is absent", () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", undefined);
  vi.stubGlobal("cancelAnimationFrame", undefined);

  const notify = vi.fn();
  const requestRender = vi.fn();
  const viewport = createViewport({
    stage: {},
    getDoc: () => ({ nodes: [createRectNode({})] }),
    notify,
    requestRender,
  });

  expect(() => viewport.panBy(1, 2)).not.toThrow();
  // 400 ms quiet window, then the fallback macrotask.
  vi.advanceTimersByTime(400);
  vi.advanceTimersByTime(1);

  expect(notify).toHaveBeenCalledTimes(1);
  expect(viewport.isMoving()).toBe(false);
});

it("cancels a queued headless settle when the camera moves again", () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", undefined);
  vi.stubGlobal("cancelAnimationFrame", undefined);

  const notify = vi.fn();
  const viewport = createViewport({
    stage: {},
    getDoc: () => ({ nodes: [createRectNode({})] }),
    notify,
    requestRender: () => {},
  });

  viewport.panBy(1, 0);
  vi.advanceTimersByTime(400); // settle queued on a timeout
  viewport.panBy(0, 1); // cancels the queued settle
  vi.advanceTimersByTime(1);

  expect(notify).not.toHaveBeenCalled();
  expect(viewport.isMoving()).toBe(true);
});

import { expect, it, vi } from "vitest";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";

it("finishes a real brush gesture and retains its last point for the next stroke", () => {
  const api = { finishPaintStroke: vi.fn() }, setLastBrushPoint = vi.fn();
  const { finishGesture } = createPointerFinishDispatcher({ api, setLastBrushPoint });
  const lastPoint = { x: 120, y: 80 };
  finishGesture({ type: "pointerup" }, { kind: "paint", tool: "brush", lastPoint });
  expect(setLastBrushPoint).toHaveBeenCalledWith(lastPoint);
  expect(api.finishPaintStroke).toHaveBeenCalledOnce();
});

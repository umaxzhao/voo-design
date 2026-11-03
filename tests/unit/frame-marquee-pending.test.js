import { describe, expect, it, vi } from "vitest";
import { createPointerMoveDispatcher } from "../../src/canvas/editor/editor_pointer_move.js";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";

function fixture(additive = false) {
  const api = {
    toDocPoint: (x, y) => ({ x, y }), select: vi.fn(), clearPixelSelection: vi.fn(),
    setMarquee: vi.fn(), selectWithin: vi.fn(),
  };
  const dispatcher = createPointerMoveDispatcher({ api, pan: {}, drawing: {}, shapes: {},
    marquee: {}, selection: {}, transform: {}, warp: {} });
  const finish = createPointerFinishDispatcher({ api });
  const gesture = { kind: "frameMarqueePending", start: { x: 10, y: 10 },
    startScreen: { x: 10, y: 10 }, additive, base: additive ? ["prior"] : [] };
  return { api, dispatcher, finish, gesture };
}

describe("Frame body marquee threshold", () => {
  it("does not start a marquee below the screen-space slop", () => {
    const { api, dispatcher, gesture } = fixture();
    dispatcher.dispatchMove({ clientX: 12, clientY: 10 }, gesture);
    expect(gesture.kind).toBe("frameMarqueePending");
    expect(api.select).not.toHaveBeenCalled();
    expect(api.setMarquee).not.toHaveBeenCalled();
  });
  it("starts a normal marquee past slop and commits selection only", () => {
    const { api, dispatcher, finish, gesture } = fixture();
    dispatcher.dispatchMove({ clientX: 30, clientY: 20 }, gesture);
    expect(gesture.kind).toBe("marquee");
    expect(api.select).toHaveBeenCalledWith(null);
    expect(api.setMarquee).toHaveBeenCalledWith({ x: 10, y: 10, width: 20, height: 10 });
    finish.finishGesture({ type: "pointerup" }, gesture);
    expect(api.selectWithin).toHaveBeenCalledWith(gesture.rect, { add: null });
  });
  it("preserves the Shift base and cancels an in-progress marquee", () => {
    const { api, dispatcher, finish, gesture } = fixture(true);
    dispatcher.dispatchMove({ clientX: 30, clientY: 20 }, gesture);
    expect(api.select).not.toHaveBeenCalled();
    finish.finishGesture({ type: "pointercancel" }, gesture);
    expect(api.setMarquee).toHaveBeenLastCalledWith(null);
    expect(api.selectWithin).not.toHaveBeenCalled();
  });
});

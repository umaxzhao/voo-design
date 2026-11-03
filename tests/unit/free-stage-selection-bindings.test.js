import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { bindPointerEvents, createPointerKeyboard } from "../../src/canvas/editor/editor-pointer-bindings.js";

afterEach(() => vi.unstubAllGlobals());

describe("free-stage selection uses the engine pointer controller", () => {
  it("forwards the real pointer identity and modifiers to the bound stage, then detaches", () => {
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const stage = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const api = { getTool: vi.fn(() => TOOL.SELECT) };
    const onPointerDown = vi.fn();
    const handlers = { onPointerDown, onPointerMove: vi.fn(), onPointerUp: vi.fn(),
      onPointerLeave: vi.fn(), onAuxClick: vi.fn(), onDoubleClick: vi.fn() };
    const keyboard = { onKeyDown: vi.fn(), onKeyUp: vi.fn(), onWindowBlur: vi.fn(), cancelActiveGesture: vi.fn() };
    const unbind = bindPointerEvents({ stage, shared: true, api, hover: {}, pan: {}, keyboard, hitTest: {}, handlers });
    const native = { type: "pointerdown", button: 0, buttons: 1, pointerId: 7, pointerType: "mouse",
      clientX: 12, clientY: 34, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false,
      pressure: 0.5, isPrimary: true, preventDefault: vi.fn() };
    expect(api.beginFreeSelection({ nativeEvent: native, button: 0 })).toBe(true);
    const forwarded = onPointerDown.mock.calls[0][0];
    expect(forwarded).toMatchObject({ target: stage, pointerId: 7, clientX: 12, clientY: 34, shiftKey: true });
    forwarded.preventDefault(); expect(native.preventDefault).toHaveBeenCalledOnce();
    api.getTool.mockReturnValue(TOOL.HAND);
    expect(api.beginFreeSelection({ nativeEvent: native, button: 0 })).toBe(false);
    unbind(); expect(api.beginFreeSelection).toBeUndefined();
  });
  it("Escape cancels a Frame-body press even before crossing the drag threshold", () => {
    const onPointerUp = vi.fn(), preventDefault = vi.fn(), stopImmediatePropagation = vi.fn();
    const keyboard = createPointerKeyboard({ stage: { style: {} }, shared: true,
      getGesture: () => ({ kind: "frameMarqueePending", pointerId: 9 }), getLastPointerEvent: () => null,
      setSpaceDown: vi.fn(), dispatchMove: vi.fn(), onPointerUp, hover: {} });
    keyboard.onKeyDown({ key: "Escape", preventDefault, stopImmediatePropagation });
    expect(onPointerUp).toHaveBeenCalledWith({ type: "pointercancel", pointerId: 9 });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});

import { createFrameMoveEvent } from "./move-gesture-start.js";
import { TOOL } from "./editor_constants.js";

const CANCELLABLE_KINDS = new Set([
  "move",
  "resize",
  "rotate",
  "cornerRadius",
  "endpoint",
  "gradientStop",
  "gradientEndpoint",
  "gradientLine",
  "perspectiveCorner",
  "meshPoint",
  "puppetPin",
  "shape",
  "arrow",
  "text",
  "region",
  "regionFree",
  "marquee",
  "pixelMarquee",
  "pixelLasso",
  "selectionMove",
  "selectionOutlineMove",
  "penEdit",
  "penBend",
  "penLasso",
  "pen",
  "lasso",
  "healing",
  "cloneStamp",
  "patchLasso",
  "patchDrag",
  "removeBrush",
  "objectStroke",
  "gradient",
]);
const cancellable = gesture => CANCELLABLE_KINDS.has(gesture?.kind);

/** Keyboard modifiers and cancellation share the same active pointer transaction. */
export function createPointerKeyboard({ stage, shared, getGesture, getLastPointerEvent,
  setSpaceDown, dispatchMove, onPointerUp, hover }) {
  const cancelActiveGesture = () => {
    const gesture = getGesture();
    if (!cancellable(gesture)) return false;
    onPointerUp({ type: "pointercancel", pointerId: gesture.pointerId });
    return true;
  };
  const updateModifiers = (event, down) => {
    const gesture = getGesture(), pointer = getLastPointerEvent();
    if (["Shift", "Alt", "Meta", "Control"].includes(event.key) && gesture && pointer) {
      dispatchMove({ ...pointer,
        shiftKey: event.key === "Shift" ? down : event.shiftKey,
        altKey: event.key === "Alt" ? down : event.altKey,
        metaKey: event.key === "Meta" ? down : event.metaKey,
        ctrlKey: event.key === "Control" ? down : event.ctrlKey,
      }, gesture);
    }
    if (event.key === "Alt" && !gesture && pointer) hover.updateHoverCursor({ ...pointer, altKey: down });
  };
  const onKeyDown = event => {
    if (event.repeat) return;
    if (event.key === "Escape" && cancelActiveGesture()) {
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    const gesture = getGesture();
    updateModifiers(event, true);
    if (event.code !== "Space" || shared) return;
    const target = event.target;
    if (target instanceof HTMLElement && (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)) return;
    event.preventDefault(); setSpaceDown(true);
    if (!gesture) stage.style.cursor = "grab";
  };
  const onKeyUp = event => {
    updateModifiers(event, false);
    if (event.code !== "Space" || shared) return;
    setSpaceDown(false);
    if (!getGesture()) stage.style.cursor = "default";
  };
  const onWindowBlur = () => {
    cancelActiveGesture();
    setSpaceDown(false);
    if (!getGesture()) stage.style.cursor = "default";
  };
  return { onKeyDown, onKeyUp, onWindowBlur, cancelActiveGesture };
}

/** Bind and unbind exactly the same listeners, including cancelled/unmounted drafts. */
export function bindPointerEvents({ stage, shared, api, hover, pan, keyboard, handlers }) {
  const beginFrameMove = (frameId, event) => {
    if (event.button !== 0 || api.getTool() !== TOOL.SELECT) return false;
    handlers.onPointerDown(createFrameMoveEvent(stage, event, frameId));
    return true;
  };
  if (api) api.beginFrameMove = beginFrameMove;
  const stageEvents = { pointerdown: handlers.onPointerDown, pointermove: handlers.onPointerMove,
    pointerup: handlers.onPointerUp, pointercancel: handlers.onPointerUp,
    pointerleave: handlers.onPointerLeave, auxclick: handlers.onAuxClick, dblclick: handlers.onDoubleClick };
  const windowEvents = { keyup: keyboard.onKeyUp, blur: keyboard.onWindowBlur };
  if (api && keyboard.cancelActiveGesture) api.cancelActiveGesture = keyboard.cancelActiveGesture;
  if (!shared) stage.addEventListener("wheel", pan.onWheel, { passive: false });
  for (const [type, handler] of Object.entries(stageEvents)) stage.addEventListener(type, handler);
  window.addEventListener("keydown", keyboard.onKeyDown, true);
  for (const [type, handler] of Object.entries(windowEvents)) window.addEventListener(type, handler);
  return () => {
    keyboard.onWindowBlur();
    if (api?.beginFrameMove === beginFrameMove) delete api.beginFrameMove;
    if (api?.refreshBrushCursor === hover.refreshBrushCursor) delete api.refreshBrushCursor;
    if (api?.cancelActiveGesture === keyboard.cancelActiveGesture) delete api.cancelActiveGesture;
    if (!shared) stage.removeEventListener("wheel", pan.onWheel);
    for (const [type, handler] of Object.entries(stageEvents)) stage.removeEventListener(type, handler);
    window.removeEventListener("keydown", keyboard.onKeyDown, true);
    for (const [type, handler] of Object.entries(windowEvents)) window.removeEventListener(type, handler);
  };
}

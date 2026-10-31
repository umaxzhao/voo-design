const cancellable = gesture => ["move", "shape", "arrow", "text"].includes(gesture?.kind);

/** Keyboard modifiers and cancellation share the same active pointer transaction. */
export function createPointerKeyboard({ stage, shared, getGesture, getLastPointerEvent,
  setSpaceDown, dispatchMove, onPointerUp, hover }) {
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
    const gesture = getGesture();
    if (event.key === "Escape" && cancellable(gesture)) {
      event.preventDefault(); event.stopImmediatePropagation();
      onPointerUp({ type: "pointercancel", pointerId: gesture.pointerId }); return;
    }
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
    const gesture = getGesture();
    if (cancellable(gesture)) onPointerUp({ type: "pointercancel", pointerId: gesture.pointerId });
    setSpaceDown(false);
    if (!getGesture()) stage.style.cursor = "default";
  };
  return { onKeyDown, onKeyUp, onWindowBlur };
}

/** Bind and unbind exactly the same listeners, including cancelled/unmounted drafts. */
export function bindPointerEvents({ stage, shared, api, hover, pan, keyboard, handlers }) {
  const stageEvents = { pointerdown: handlers.onPointerDown, pointermove: handlers.onPointerMove,
    pointerup: handlers.onPointerUp, pointercancel: handlers.onPointerUp,
    pointerleave: handlers.onPointerLeave, auxclick: handlers.onAuxClick, dblclick: handlers.onDoubleClick };
  const windowEvents = { keydown: keyboard.onKeyDown, keyup: keyboard.onKeyUp, blur: keyboard.onWindowBlur };
  if (!shared) stage.addEventListener("wheel", pan.onWheel, { passive: false });
  for (const [type, handler] of Object.entries(stageEvents)) stage.addEventListener(type, handler);
  for (const [type, handler] of Object.entries(windowEvents)) window.addEventListener(type, handler);
  return () => {
    keyboard.onWindowBlur();
    if (api.refreshBrushCursor === hover.refreshBrushCursor) delete api.refreshBrushCursor;
    if (!shared) stage.removeEventListener("wheel", pan.onWheel);
    for (const [type, handler] of Object.entries(stageEvents)) stage.removeEventListener(type, handler);
    for (const [type, handler] of Object.entries(windowEvents)) window.removeEventListener(type, handler);
  };
}

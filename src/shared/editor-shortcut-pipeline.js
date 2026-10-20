/** Shared command routing for global editor shortcuts. */

export const HISTORY_SHORTCUT_ACTION = Object.freeze({
  UNDO: "undo",
  REDO: "redo",
});

export const MAGNETIC_LASSO_SHORTCUT_ACTION = Object.freeze({
  CANCEL: "magneticCancel",
  FINISH: "magneticFinish",
  REMOVE_ANCHOR: "magneticRemoveAnchor",
  STRAIGHT_ON: "magneticStraightOn",
  STRAIGHT_OFF: "magneticStraightOff",
});

/** Routes Magnetic Lasso draft keys before generic editor shortcuts. */
export function magneticLassoShortcutAction(
  event,
  { active = false, phase = "keydown" } = {},
) {
  if (!active || !event) return null;
  if (event.key === "Alt") {
    return phase === "keyup"
      ? MAGNETIC_LASSO_SHORTCUT_ACTION.STRAIGHT_OFF
      : MAGNETIC_LASSO_SHORTCUT_ACTION.STRAIGHT_ON;
  }
  if (phase !== "keydown") return null;
  if (event.key === "Escape") return MAGNETIC_LASSO_SHORTCUT_ACTION.CANCEL;
  if (event.key === "Enter") return MAGNETIC_LASSO_SHORTCUT_ACTION.FINISH;
  if (event.key === "Backspace" || event.key === "Delete") {
    return MAGNETIC_LASSO_SHORTCUT_ACTION.REMOVE_ANCHOR;
  }
  return null;
}

/** Resolve the cross-platform undo/redo chord without performing side effects. */
export function historyShortcutAction(event) {
  if (!event || !(event.metaKey || event.ctrlKey)) return null;
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  const isUndoKey = event.code === "KeyZ" || key === "z";
  const isRedoKey = event.code === "KeyY" || key === "y";

  if (isUndoKey) {
    return event.shiftKey
      ? HISTORY_SHORTCUT_ACTION.REDO
      : HISTORY_SHORTCUT_ACTION.UNDO;
  }
  return isRedoKey ? HISTORY_SHORTCUT_ACTION.REDO : null;
}

/**
 * Run an ordered shortcut action stack and stop after the first handled layer.
 * Handlers return a stable action id when handled and null otherwise.
 */
export function firstHandledShortcutAction(handlers) {
  if (!Array.isArray(handlers)) {
    throw new TypeError("Shortcut action handlers must be an array");
  }
  for (const handler of handlers) {
    if (typeof handler !== "function") {
      throw new TypeError("Each shortcut action handler must be a function");
    }
    const action = handler();
    if (action) return action;
  }
  return null;
}

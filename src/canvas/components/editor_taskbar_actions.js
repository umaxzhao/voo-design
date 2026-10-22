/**
 * Engine-facing actions for the contextual taskbar.
 *
 * Kept as pure helpers so the taskbar's buttons cannot silently regress into
 * no-ops again: every function targets a method that actually exists on the
 * editor engine and reports whether it ran.
 */

/**
 * Toggle the `locked` flag on a node. The engine exposes `toggleLockNode`
 * (editor_engine_node_ops.js); there is no `engine.toggleLock`.
 *
 * @returns {boolean} true when a lock toggle was requested.
 */
export function toggleNodeLock(engine, node) {
  const id = node?.id;
  if (!id) return false;
  if (typeof engine?.toggleLockNode !== "function") return false;
  engine.toggleLockNode(id);
  return true;
}

/**
 * Clear the active pixel selection ("Deselect" in the selection context).
 * The engine exposes `clearPixelSelection` (editor_engine_selection.js);
 * there is no `engine.clearSelection`.
 *
 * @returns {boolean} true when a clear was requested.
 */
export function clearActivePixelSelection(engine) {
  if (typeof engine?.clearPixelSelection !== "function") return false;
  engine.clearPixelSelection();
  return true;
}

/**
 * Finish the pen gesture behind the taskbar's check button, mirroring the
 * Enter-key behaviour in use_editor_shortcuts.js:
 * - an in-progress draft is committed with `finishPen`,
 * - an open path-editing session is closed with `endEdit`.
 *
 * @returns {"finishPen"|"endEdit"|null} which action ran, or null when there
 * was nothing to finish.
 */
export function finishPenPathEditing(engine) {
  if (engine?.getPenDraft?.()) {
    engine.finishPen?.();
    return "finishPen";
  }
  if (engine?.isEditing?.()) {
    engine.endEdit?.();
    return "endEdit";
  }
  return null;
}

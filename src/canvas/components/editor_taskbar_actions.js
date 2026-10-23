/**
 * Engine-facing actions for the contextual taskbar.
 *
 * Kept as pure helpers so the taskbar's buttons cannot silently regress into
 * no-ops again: every function targets a method that actually exists on the
 * editor engine and reports whether it ran.
 */

import { isLockedByGroup } from "../editor/scene_model_groups.js";

/**
 * Toggle the `locked` flag on a node. The engine exposes `toggleLockNode`
 * (editor_engine_node_ops.js); there is no `engine.toggleLock`.
 *
 * Respects locked-by-group: if the node (or any ancestor folder) is locked,
 * the toggle is not performed.
 *
 * @param {Object} engine - Editor engine instance
 * @param {Object} node - Target node to toggle lock on
 * @returns {boolean} true when a lock toggle was requested, false otherwise
 */
export function toggleNodeLock(engine, node) {
  const id = node?.id;
  if (!id) return false;
  if (typeof engine?.toggleLockNode !== "function") return false;
  const doc = engine.getDoc?.();
  if (doc && node && (node.locked || isLockedByGroup(doc, node))) {
    return false;
  }
  engine.toggleLockNode(id);
  return true;
}

/**
 * Clear the active pixel selection ("Deselect" in the selection context).
 * The engine exposes `clearPixelSelection` (editor_engine_selection.js);
 * there is no `engine.clearSelection`.
 *
 * @param {Object} engine - Editor engine instance
 * @returns {boolean} true when a clear was requested, false otherwise
 */
export function clearActivePixelSelection(engine) {
  if (typeof engine?.clearPixelSelection !== "function") return false;
  engine.clearPixelSelection();
  return true;
}

/**
 * Finish the pen gesture behind the taskbar's check button, mirroring the
 * Enter-key behaviour in use_editor_shortcuts.js:
 * - an in-progress draft is committed with `finishPen`
 * - an open path-editing session is closed with `endEdit`
 *
 * Prefers `engine.endEdit` when path editing, `finishPen` when drafting.
 *
 * @param {Object} engine - Editor engine instance
 * @returns {boolean} true when an action was performed, false otherwise
 */
export function finishPenPathEditing(engine) {
  if (!engine) return false;
  if (engine.isEditing?.()) {
    if (typeof engine.endEdit === "function") {
      engine.endEdit();
      return true;
    }
  }
  if (engine.getPenDraft?.()) {
    if (typeof engine.finishPen === "function") {
      engine.finishPen();
      return true;
    }
  }
  return false;
}
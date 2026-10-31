import * as ops from "./doc_ops.js";
import { captureMoveGestureFrame, moveGestureIds } from "./move_gesture.js";

/** Capture once before the first preview, including the untouched redo branch. */
export function captureMoveRollback(api, gesture) {
  if (gesture.rollbackState) return;
  gesture.rollbackState = {
    session: api.captureDocumentSession?.() ?? null,
    doc: api.getDocument(),
    selectedIds: api.getSelectedIds?.() ?? [gesture.id],
    groupId: api.getSelectedGroup?.()?.id ?? null,
  };
}

/** Defer cloning until a real drag, then let its release own the history entry. */
export function beginAltDuplicate(api, gesture) {
  const doc = api.getDocument();
  const groupId = api.getSelectedGroup?.()?.id ?? null;
  captureMoveRollback(api, gesture);
  const duplicate = () => {
    if (groupId) api.selectExactly?.([groupId]);
    if (typeof api.duplicateSelected === "function") {
      api.duplicateSelected({ commit: false, repeatTransform: false });
    } else {
      const result = ops.duplicateNode(doc, gesture.id, 0);
      if (!result.id) return;
      api.setDoc(result.doc, { commit: false });
      api.select?.(result.id);
    }
  };
  // Preview selection belongs to the pending snapshot, not the original
  // history entry: one undo must reselect the original selection units.
  if (api.mute) api.mute(duplicate); else duplicate();
  const target = api.getSelected?.();
  if (!target || doc.nodes.some(node => node.id === target.id)) return false;
  const next = api.getDocument();
  const base = api.getSelectedNodes?.() ?? [target];
  const ids = moveGestureIds(api, next, base);
  if (!ids.length) return false;
  gesture.id = target.id;
  gesture.origins = captureMoveGestureFrame(next, ids).origins;
  gesture.duplicated = true;
  return true;
}

const TRANSFORM_ROLLBACK_KINDS = new Set([
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
]);

export function rollbackMoveGesture(api, gesture) {
  if (!TRANSFORM_ROLLBACK_KINDS.has(gesture?.kind) || !gesture.rollbackState) return false;
  const { doc, selectedIds, groupId, session } = gesture.rollbackState;
  if (session && api.restoreDocumentSession) {
    api.restoreDocumentSession(session);
  } else {
    api.setDoc(doc, { commit: false });
    api.selectExactly?.(selectedIds);
  }
  if (groupId) api.selectGroup?.(groupId);
  return true;
}

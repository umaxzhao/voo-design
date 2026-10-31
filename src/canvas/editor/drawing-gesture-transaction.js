/** Capture immutable document/selection references without copying the undo stack. */
export function drawingRollbackState(api) {
  return { doc: api.getDocument(), ids: api.getSelectedIds?.() ?? [], groupId: api.getSelectedGroup?.()?.id ?? null };
}

export function selectDrawingDraft(api, id) {
  const select = () => api.select(id);
  if (api.mute) api.mute(select); else select();
}

export function rollbackDrawingGesture(api, gesture) {
  if (!["shape", "arrow", "text"].includes(gesture?.kind) || !gesture.drawingRollback) return false;
  const { doc, ids, groupId } = gesture.drawingRollback;
  const restore = () => {
    api.setTextDraftRect?.(null);
    api.setDoc(doc, { commit: false });
    if (groupId) api.selectGroup?.(groupId);
    else api.selectExactly?.(ids);
  };
  if (api.mute) api.mute(restore); else restore();
  return true;
}

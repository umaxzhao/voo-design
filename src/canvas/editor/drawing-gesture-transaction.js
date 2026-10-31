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
    const current = api.getDocument();
    const remaining = current.nodes.filter(node => node.id !== gesture.id);
    const sameNodes = remaining.length === doc.nodes.length && remaining.every((node, index) => node === doc.nodes[index]);
    const sameFields = Object.keys({ ...doc, ...current }).every(key => key === "nodes" || current[key] === doc[key]);
    const draft = current.nodes.find(node => node.id === gesture.id);
    // An editor may receive another change while its text overlay is open.
    // Cancel only this draft, never discard the unrelated live document.
    const restored = sameNodes && sameFields ? doc : { ...current, nodes: remaining.map(node => {
      let next = node.parentId === gesture.id ? { ...node, parentId: draft?.parentId ?? null } : node;
      if (next.clipTo === gesture.id) { next = { ...next }; delete next.clipTo; }
      return next;
    }) };
    const liveIds = new Set(restored.nodes.map(node => node.id));
    api.setTextDraftRect?.(null);
    api.setDoc(restored, { commit: false });
    if (groupId && liveIds.has(groupId)) api.selectGroup?.(groupId);
    else api.selectExactly?.(ids.filter(id => liveIds.has(id)));
  };
  if (api.mute) api.mute(restore); else restore();
  return true;
}

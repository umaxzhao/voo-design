/** Asset expansion creates many nodes, but publishes one undoable document change. */
export function commitAssetExpansion(editor, mutate, name) {
  const before = editor.getDocument?.() ?? editor.getDoc?.();
  const selected = editor.getSelectedIds?.()?.slice() ?? [];
  const batched = typeof editor.beginBatch === "function" && typeof editor.endBatch === "function";
  if (batched) editor.beginBatch();
  let result;
  try {
    result = mutate();
  } catch (error) {
    try {
      if (before && editor.setDoc) editor.setDoc(before, {
        commit: false
      });
      editor.selectExactly?.(selected);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "asset-expansion-rollback-failed");
    } finally {
      if (batched) editor.endBatch();
    }
    throw error;
  }
  if (batched) editor.endBatch();
  if (before && editor.setDoc) editor.setDoc(editor.getDocument?.() ?? editor.getDoc(), {
    name
  });else editor.commitEditorDocument?.({
    message: name
  });
  return result;
}

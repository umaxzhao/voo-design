/** Route page management and the focused page's content through the same controls. */
export function presentationHistoryTarget(
  state,
  ownerId,
  engine,
  direction,
  activePageIds = [],
) {
  const stack = direction === "redo" ? state.redoStack : state.undoStack;
  const record = stack?.at(-1);
  const entry = record?.entry ?? record;
  const ownsPageEdit =
    ownerId &&
    entry?.actionId === "workflow.presentation.edit" &&
    entry.presentationOwnerId === ownerId;
  const ownsArtboardMove =
    entry?.actionId === "workflow.editor.moveArtboard" &&
    activePageIds.includes(entry.artboardNodeId);
  const ownsArtboardDelete =
    entry?.actionId === "workflow.editor.deleteArtboard" &&
    (activePageIds.includes(entry.artboardNodeId) ||
      (Array.isArray(entry.previousEditingNodeIds) &&
        entry.previousEditingNodeIds.some((id) => activePageIds.includes(id))));
  const ownsComponentCreate =
    entry?.actionId === "workflow.editor.createComponent" &&
    Array.isArray(entry.previousEditingNodeIds) &&
    entry.previousEditingNodeIds.some((id) => activePageIds.includes(id));
  if (
    !ownsPageEdit &&
    !ownsArtboardMove &&
    !ownsArtboardDelete &&
    !ownsComponentCreate
  )
    return "editor";
  const index = engine?.getCurrentHistoryIndex?.() ?? 0;
  const entries = engine?.getHistoryEntries?.() ?? [];
  if (direction === "undo") {
    if (
      !engine?.canUndo?.() ||
      (entries[index]?.timestamp ?? 0) <= entry.timestamp
    )
      return "workflow";
  } else if (
    !engine?.canRedo?.() ||
    (entries[index + 1]?.timestamp ?? Infinity) >= entry.timestamp
  ) {
    // A new content edit after a page undo starts a new branch.
    if (index === 0 || (entries[index]?.timestamp ?? 0) <= entry.timestamp)
      return "workflow";
  }
  return "editor";
}

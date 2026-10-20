/**
 * Derives expanded canvas roots from each open editor engine's own selection.
 * Workflow node selection is intentionally unrelated to layer-panel state.
 */
function getNestedHostCanvasId(canvasPageIds, engineEntries, context) {
  const { focusedCanvasId, selectedInstanceChild: selection } = context ?? {};
  if (!selection || !canvasPageIds.includes(focusedCanvasId)) return null;
  const host = engineEntries.get?.(focusedCanvasId);
  if (!host?.ready || !host.engine) return null;
  const instance = host.engine
    .getDocument?.()
    ?.nodes?.find(
      (node) =>
        node.id === selection.instanceId &&
        node.kind === "canvasInstance" &&
        node.sourceCanvasId === selection.sourceCanvasId,
    );
  if (!instance) return null;
  const childIds =
    Array.isArray(selection.nodeIds) && selection.nodeIds.length > 0
      ? selection.nodeIds
      : selection.nodeId
        ? [selection.nodeId]
        : [];
  if (childIds.length === 0) return null;
  const validSource = canvasPageIds.some((pageId) => {
    const source = engineEntries.get?.(pageId);
    if (!source?.ready || !source.engine) return false;
    const sourceDoc = source.engine.getDocument?.();
    if (
      !sourceDoc ||
      (pageId !== instance.sourceCanvasId &&
        sourceDoc.canvasId !== instance.sourceCanvasId)
    )
      return false;
    return childIds.every((id) =>
      sourceDoc.nodes?.some((node) => node.id === id),
    );
  });
  return validSource ? focusedCanvasId : null;
}

export function getSelectedCanvasPageIds(
  canvasPageIds = [],
  engineEntries,
  context,
) {
  if (!Array.isArray(canvasPageIds) || !engineEntries) return [];

  // Nested selection clears the host engine selection; its valid child must
  // still keep the host root mounted without inventing background selection.
  const nestedHostId = getNestedHostCanvasId(
    canvasPageIds,
    engineEntries,
    context,
  );
  return canvasPageIds.filter((canvasId) => {
    const entry = engineEntries.get?.(canvasId);
    if (!entry?.ready || !entry.engine) return false;

    const selectedIds = entry.engine.getSelectedIds?.() ?? [];
    return (
      canvasId === nestedHostId ||
      selectedIds.length > 0 ||
      entry.engine.isBackgroundSelected?.() === true
    );
  });
}

/** Returns open canvas roots that must remain folded for the current selection. */
export function getCollapsedCanvasPageIds(
  canvasPageIds = [],
  selectedIds = [],
) {
  const selected = new Set(selectedIds);
  return canvasPageIds.filter((canvasId) => !selected.has(canvasId));
}

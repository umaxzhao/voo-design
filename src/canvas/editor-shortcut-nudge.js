/** A nudge burst belongs to its original engine even after focus moves. */
export function nudgeSelection({ engine, nudgedRef }, dx, dy) {
  if (nudgedRef.current && nudgedRef.current !== engine) finishNudge(nudgedRef);
  if (engine.isEditing?.()) {
    const moved = engine.nudgeActiveAnchor?.(dx, dy);
    if (moved) {
      nudgedRef.current = engine;
      return;
    }
  }
  const selectedGroup = engine.getSelectedGroup?.() ?? null;
  const selectedNodes = selectedGroup
    ? [selectedGroup]
    : (engine.getSelectedNodes?.() ?? [engine.getSelected()]);
  const movableNodes = selectedNodes.filter(
    (node) => node && !node.locked && !node.lockPosition,
  );
  if (movableNodes.length === 0) return;
  if (typeof engine.moveNodesBy === "function") {
    engine.moveNodesBy(
      movableNodes.map((node) => node.id),
      dx,
      dy,
      { commit: false },
    );
  } else {
    for (const node of movableNodes) {
      engine.moveNodeBy?.(node.id, dx, dy, { commit: false });
    }
  }
  nudgedRef.current = engine;
}

export function finishNudge(nudgedRef) {
  const engine = nudgedRef.current;
  if (!engine) return;
  nudgedRef.current = false;
  engine.commit('editor.history.entry.transform');
}

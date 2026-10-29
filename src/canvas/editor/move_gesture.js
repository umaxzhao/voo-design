/**
 * Which nodes a move drag carries, and where they start. Static documents only:
 * every drag reads the document as it is.
 */

export function moveGestureIds(api, doc, base) {
  // Group selection stores leaf IDs. Carry its verified container as the move
  // root so its nested metadata and parent links cannot be left behind.
  const selectedGroup = api.getSelectedGroup?.();
  const baseIds = selectedGroup ? [selectedGroup.id] : base.map((node) => node.id);
  const expanded = api.expandMoveSet?.(baseIds);
  const locked = (id) =>
    doc.nodes.find((node) => node.id === id)?.locked === true;
  // A locked member cannot make a complete Group degrade into a partial move.
  if (selectedGroup && (expanded ?? baseIds).some(locked)) return [];
  const ids = expanded && !expanded.some(locked) ? expanded : baseIds;
  return ids.some(
    (id) => doc.nodes.find((node) => node.id === id)?.lockPosition === true,
  )
    ? []
    : ids;
}

export function captureMoveGestureFrame(doc, ids) {
  const origins = ids.flatMap((id) => {
    const node = doc.nodes.find((entry) => entry.id === id);
    return node ? [{ id, x: node.x, y: node.y }] : [];
  });
  return { origins };
}

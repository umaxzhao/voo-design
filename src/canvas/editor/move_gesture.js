/**
 * Which nodes a move drag carries, and where they start. Static documents only:
 * every drag reads the document as it is.
 */

export function moveGestureIds(api, doc, base) {
  const baseIds = base.map((node) => node.id);
  const expanded = api.expandMoveSet?.(baseIds);
  const locked = (id) =>
    doc.nodes.find((node) => node.id === id)?.locked === true;
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

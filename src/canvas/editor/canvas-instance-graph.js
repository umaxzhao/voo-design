/** Reject source references that would make a canvas contain itself. */
export function wouldCreateCanvasCycle(targetId, sourceId, resolveCanvas) {
  const targetAliases = new Set([targetId]);
  const targetDoc = resolveCanvas(targetId);
  if (targetDoc?.canvasId) targetAliases.add(targetDoc.canvasId);
  if (targetAliases.has(sourceId)) return true;
  const visited = new Set();
  const pending = [sourceId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (targetAliases.has(id)) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const doc = resolveCanvas(id);
    if (!doc) continue;
    for (const node of doc.nodes ?? []) {
      if (node.kind === "canvasInstance" && node.sourceCanvasId) {
        pending.push(node.sourceCanvasId);
      }
    }
  }
  return false;
}

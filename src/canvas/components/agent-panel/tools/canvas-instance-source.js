import { NODE_TYPE } from "../../../nodes/node_enums.js";

function documentForNode(store, node) {
  const live = store.editorBridges?.[node.id]?.engine?.getDocument?.();
  if (live) return live;
  const session =
    store.presentationSession?.ownerId === node.data?.presentationOwnerId
      ? store.presentationSession
      : null;
  return session?.getPageDocument?.(node.id) ?? node.data?.editorDoc ?? null;
}

/** Use the same workflow-ID or canvas-ID references as the editor renderer. */
function findCanvas(store, reference, targetId, targetDoc) {
  if (
    reference === targetId ||
    (targetDoc.canvasId && reference === targetDoc.canvasId)
  )
    return { id: targetId, doc: targetDoc };
  for (const node of store.nodes ?? []) {
    if (node.type !== NODE_TYPE.IMAGE_EDITOR) continue;
    const doc = documentForNode(store, node);
    if (node.id === reference || doc?.canvasId === reference)
      return { id: node.id, doc };
  }
  return null;
}

/** Check every reachable master before returning an operation to the atomic editor. */
export function resolveCanvasInstanceSource(
  store,
  operation,
  targetId,
  targetDoc,
) {
  if (operation.type !== "insert_canvas_instance") return operation;
  if (
    typeof operation.sourceCanvasId !== "string" ||
    !operation.sourceCanvasId.trim()
  )
    throw new TypeError("A source canvas ID is required");
  const sourceCanvasId = operation.sourceCanvasId.trim();
  const visited = new Set();
  const ancestors = new Set();

  function visit(reference) {
    const source = findCanvas(store, reference, targetId, targetDoc);
    if (!source?.doc || !Array.isArray(source.doc.nodes))
      throw new TypeError(`Canvas source not found: ${reference}`);
    if (source.id === targetId)
      throw new RangeError("A canvas cannot contain an instance of itself");
    if (ancestors.has(source.id))
      throw new RangeError("Canvas instances cannot form a cycle");
    if (visited.has(source.id)) return;
    ancestors.add(source.id);
    for (const child of source.doc.nodes) {
      if (child.kind === "canvasInstance") visit(child.sourceCanvasId);
    }
    ancestors.delete(source.id);
    visited.add(source.id);
  }

  visit(sourceCanvasId);
  return { ...operation, sourceCanvasId };
}

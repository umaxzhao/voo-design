import { nodeAABB } from "../editor/scene_geometry.js";
import { cloneNodeForDuplicate, remapDuplicateReferences } from "../editor/node-duplicate.js";
import { moveAffectedIds } from "../editor/doc_ops_move.js";
import { createGroupNode } from "../editor/scene_model_groups.js";
import { wouldCreateCanvasCycle } from "../editor/canvas-instance-graph.js";
import { createCanvasInstanceNode } from "../editor/canvas-composition-model.js";

export function selectionResource(doc, ids) {
  const included = new Set(moveAffectedIds(doc, ids));
  const nodes = structuredClone(doc.nodes.filter(node => included.has(node.id)));
  if (!nodes.length) throw new Error("resource-empty");
  for (const node of nodes) {
    if (!included.has(node.parentId)) node.parentId = null;
    if (!included.has(node.clipTo)) delete node.clipTo;
  }
  return { ...doc, nodes, resourceSelection: true };
}

/** New copies never retain links to unrelated nodes in the destination. */
export function resourceCopies(source, point, name) {
  if (!Array.isArray(source?.nodes) || !source.nodes.length) throw new Error("resource-empty");
  const rootIds = new Set(source.nodes.map(node => node.id));
  const roots = source.nodes.filter(node => !rootIds.has(node.parentId));
  if (!roots.length) throw new Error("resource-invalid-tree");
  const x = Math.min(...roots.map(node => node.x ?? 0));
  const y = Math.min(...roots.map(node => node.y ?? 0));
  const copies = new Map(source.nodes.map(node => [node.id, cloneNodeForDuplicate(node)]));
  for (const copy of copies.values()) {
    copy.x = (copy.x ?? 0) + point.x - x;
    copy.y = (copy.y ?? 0) + point.y - y;
    if (!rootIds.has(copy.parentId)) copy.parentId = null;
    if (!rootIds.has(copy.clipTo)) delete copy.clipTo;
    remapDuplicateReferences(copy, copies);
  }
  // Legacy templates have a document backdrop rather than an explicit Frame.
  if (!source.resourceSelection && !roots.some(node => node.isFrame || node.frame)) {
    const frame = { ...createGroupNode({ x: point.x, y: point.y, width: source.width, height: source.height }),
      isFrame: true, frame: true, name, fill: source.backgroundColor ?? "transparent", clipContent: false };
    for (const copy of copies.values()) if (!copy.parentId) copy.parentId = frame.id;
    return [frame, ...copies.values()];
  }
  return [...copies.values()];
}

export function insertResourceNodes(engine, source, point, name) {
  const copies = resourceCopies(source, point, name);
  const doc = engine.getDocument();
  engine.setDoc({ ...doc, nodes: [...doc.nodes, ...copies] }, { name: "editor.assets.insertHistory" });
  const roots = copies.filter(node => !node.parentId);
  engine.selectExactly(roots.map(node => node.id));
  engine.zoomToSelection?.(roots.map(node => nodeAABB(node)));
  return copies;
}

export function insertComponentResource(engine, page, source, point, { resolveCanvas, targetId } = {}) {
  const target = engine.getDocument();
  const resolve = id => id === (targetId ?? target.canvasId) || id === target.canvasId ? target
    : id === page.id || id === source.canvasId ? source : resolveCanvas?.(id) || target.components?.[id];
  if (wouldCreateCanvasCycle(targetId ?? target.canvasId, page.id, resolve)) throw new Error("resource-component-cycle");
  if (source.canvasId === engine.getDocument().canvasId) throw new Error("resource-self-instance");
  const instance = createCanvasInstanceNode({ sourceCanvasId: page.id, x: point.x, y: point.y,
    width: source.width, height: source.height, name: page.title });
  const doc = engine.getDocument();
  engine.setDoc({ ...doc, nodes: [...doc.nodes, instance] }, { name: "editor.assets.insertHistory" });
  engine.selectExactly([instance.id]);
  engine.zoomToSelection?.([instance]);
  return instance;
}

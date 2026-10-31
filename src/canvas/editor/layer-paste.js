import { cloneNodeForDuplicate, remapDuplicateReferences } from "./node-duplicate.js";
import { insertionTarget } from "./frame-target.js";
import { groupBlockInsertIndex, withNodes } from "./doc_ops_nodes.js";

/** Keep pasted parent blocks contiguous without running a full insertion per layer. */
function insertBlocks(doc, copies) {
  const byId = new Map(copies.map(copy => [copy.id, copy]));
  const positions = new Map(), blocks = new Map();
  for (const copy of copies) {
    let root = copy;
    const seen = new Set([copy.id]);
    while (byId.has(root.parentId) && !seen.has(root.parentId)) {
      seen.add(root.parentId); root = byId.get(root.parentId);
    }
    const owner = root.parentId ?? null;
    if (!positions.has(owner)) {
      const at = groupBlockInsertIndex(doc, root);
      positions.set(owner, at < 0 ? doc.nodes.length : at);
    }
    const index = positions.get(owner), block = blocks.get(index) ?? [];
    block.push(copy); blocks.set(index, block);
  }
  const nodes = [];
  for (let index = 0; index <= doc.nodes.length; index++) {
    for (const copy of blocks.get(index) ?? []) nodes.push(copy);
    if (index < doc.nodes.length) nodes.push(doc.nodes[index]);
  }
  return withNodes(doc, nodes);
}

/** Only explicit destination Frames replace ownership; copied descendants keep theirs. */
export function pasteLayerNodes(doc, clipboard, selectedIds, viewportCenter) {
  const sourceIds = new Set(clipboard.nodes.map(node => node.id));
  const target = insertionTarget(doc, null, selectedIds, sourceIds);
  const center = target.point ?? viewportCenter;
  const bounds = clipboard.nodes.reduce((b, n) => ({ minX: Math.min(b.minX, n.x ?? 0),
    minY: Math.min(b.minY, n.y ?? 0), maxX: Math.max(b.maxX, (n.x ?? 0) + (n.width ?? 0)),
    maxY: Math.max(b.maxY, (n.y ?? 0) + (n.height ?? 0)) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const dx = Number.isFinite(center?.x) ? center.x - (bounds.minX + bounds.maxX) / 2 : 20;
  const dy = Number.isFinite(center?.y) ? center.y - (bounds.minY + bounds.maxY) / 2 : 20;
  const sameCanvas = Boolean(doc.canvasId && doc.canvasId === clipboard.sourceCanvasId);
  const existing = new Map(doc.nodes.map(node => [node.id, node]));
  const copiesById = new Map(clipboard.nodes.map(node => [node.id, {
    ...cloneNodeForDuplicate(node), x: (node.x ?? 0) + dx, y: (node.y ?? 0) + dy,
  }]));
  for (const original of clipboard.nodes) {
    const copy = copiesById.get(original.id);
    const externalParent = !copiesById.has(original.parentId);
    if (externalParent) {
      copy.parentId = target.frame?.id ?? (sameCanvas && existing.has(original.parentId) ? original.parentId : null);
    }
    if (copy.clipTo && !copiesById.has(copy.clipTo)) {
      const base = existing.get(copy.clipTo);
      if (!sameCanvas || !base || (base.parentId ?? null) !== (copy.parentId ?? null)) copy.clipTo = null;
    }
    remapDuplicateReferences(copy, copiesById);
  }
  const copies = [...copiesById.values()], copiedIds = new Set(copies.map(copy => copy.id));
  return { doc: insertBlocks(doc, copies), selectedIds: copies
    .filter(copy => !copiedIds.has(copy.parentId)).map(copy => copy.id) };
}

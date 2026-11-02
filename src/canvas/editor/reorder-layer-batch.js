import { isLockedByGroup, isRegionNode } from "./scene_model.js";
import { moveAffectedIds } from "./doc_ops_move.js";
import { groupingRoots } from "./group-structure.js";

/** Preserve group subtrees and selection order while moving sibling blocks. */
export function reorderLayerBatch(doc, ids, direction) {
  if (![1, -1].includes(direction) || !ids?.length || doc.nodes.length < 2) return null;
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const unitOf = node => {
    let current = node;
    const seen = new Set();
    while (current?.clipTo && !seen.has(current.clipTo)) {
      seen.add(current.clipTo);
      const base = byId.get(current.clipTo);
      if (base) current = base;
      else break;
    }
    return current;
  };
  // A mask base and its followers are one stack unit even when all are selected.
  const selected = new Set(ids.map(id => byId.get(id)).filter(Boolean).map(node => unitOf(node).id));
  const selectedAncestor = node => {
    const visited = new Set();
    for (let parent = byId.get(node.parentId); parent && !visited.has(parent.id); parent = byId.get(parent.parentId)) {
      if (selected.has(parent.id)) return true;
      visited.add(parent.id);
    }
    return false;
  };
  const roots = doc.nodes.filter(node => selected.has(node.id) && !selectedAncestor(node));
  if (direction > 0) roots.reverse();
  const blockIds = node => new Set(moveAffectedIds(doc, [unitOf(node).id]));
  let nodes = doc.nodes;
  for (const rawRoot of roots) {
    const root = unitOf(rawRoot);
    const moving = blockIds(root);
    const siblings = nodes.filter(node => (node.parentId ?? null) === (root.parentId ?? null));
    const index = siblings.findIndex(node => node.id === root.id);
    if (index < 0) continue;
    let neighbor = null;
    if (direction > 0) {
      for (let i = index + 1; i < siblings.length; i++) {
        if (!moving.has(siblings[i].id)) { neighbor = unitOf(siblings[i]); break; }
      }
    } else {
      for (let i = index - 1; i >= 0; i--) {
        if (!moving.has(siblings[i].id)) { neighbor = unitOf(siblings[i]); break; }
      }
    }
    if (!neighbor || selected.has(neighbor.id) || isRegionNode(root) !== isRegionNode(neighbor)) continue;
    const adjacent = blockIds(neighbor);
    if (nodes.some(node => (moving.has(node.id) || adjacent.has(node.id)) && (node.locked || isLockedByGroup(doc, node)))) continue;
    const block = nodes.filter(node => moving.has(node.id));
    const rest = nodes.filter(node => !moving.has(node.id));
    let target = rest.findIndex(node => adjacent.has(node.id));
    if (target < 0) continue;
    if (direction > 0) {
      for (let i = target; i < rest.length; i++) if (adjacent.has(rest[i].id)) target = i + 1;
    }
    nodes = [...rest.slice(0, target), ...block, ...rest.slice(target)];
  }
  return nodes === doc.nodes ? null : nodes;
}

/**
 * Moves a node or batch of nodes to an arbitrary target stack index.
 * Preserves group subtrees, clipping followers, selection relative order,
 * and locked layer constraints.
 */
export function reorderLayerBatchTo(doc, idOrIds, targetIndex, primaryId) {
  if (!Number.isFinite(targetIndex) || !doc.nodes?.length) return null;
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  if (!ids.length) return null;

  const roots = groupingRoots(doc, ids);
  if (!roots.length) return null;
  if (roots.some(n => n.locked || isLockedByGroup(doc, n) || isRegionNode(n))) return null;

  const target = Math.max(0, Math.min(doc.nodes.length - 1, Math.round(targetIndex)));
  const targetNode = doc.nodes[target];
  if (!targetNode || isRegionNode(targetNode)) return null;

  const blockIds = new Set(moveAffectedIds(doc, roots.map(n => n.id)));
  if (blockIds.has(targetNode.id)) return null;

  const leadId = primaryId && blockIds.has(primaryId)
    ? primaryId
    : (roots.find(r => r.id === primaryId)?.id ?? roots[0].id);
  const draggedIndex = doc.nodes.findIndex(n => n.id === leadId);
  if (draggedIndex < 0 || draggedIndex === target) return null;

  const lo = Math.min(draggedIndex, target);
  const hi = Math.max(draggedIndex, target);
  for (let i = lo; i <= hi; i += 1) {
    if (!blockIds.has(doc.nodes[i].id) && doc.nodes[i].locked) return null;
  }

  const rest = doc.nodes.filter(n => !blockIds.has(n.id));
  const targetInRest = rest.findIndex(n => n.id === targetNode.id);
  if (targetInRest < 0) return null;

  let insertAt = target > draggedIndex ? targetInRest + 1 : targetInRest;

  const firstLocked = rest.findIndex(n => n.locked || isLockedByGroup(doc, n));
  if (firstLocked >= 0 && insertAt <= firstLocked) {
    insertAt = firstLocked + 1;
  }
  insertAt = Math.max(0, Math.min(rest.length, insertAt));

  const block = doc.nodes.filter(n => blockIds.has(n.id));
  return [
    ...rest.slice(0, insertAt),
    ...block,
    ...rest.slice(insertAt),
  ];
}

import { mergeEditorDocuments } from "../store/merge.js";

/** Preserve historical local nodes without retaining remotely deleted parents. */
export function rebaseCollabHistory(previous, snapshot, remote) {
  const merged = mergeEditorDocuments(previous, snapshot, remote);
  if (!Array.isArray(merged?.nodes)) return merged;
  const remoteIds = new Set((remote?.nodes ?? []).map(node => node.id));
  const deleted = new Set((previous?.nodes ?? []).filter(node => !remoteIds.has(node.id)).map(node => node.id));
  if (!deleted.size) return merged;
  const ancestors = new Map((previous?.nodes ?? []).map(node => [node.id, node.parentId]));
  const kept = new Set(merged.nodes.map(node => node.id));
  return { ...merged, nodes: merged.nodes.map(node => {
    if (!deleted.has(node.parentId) || kept.has(node.parentId)) return node;
    let parent = node.parentId;
    const seen = new Set([node.id]);
    while (parent && !kept.has(parent) && !seen.has(parent)) { seen.add(parent); parent = ancestors.get(parent); }
    return { ...node, parentId: parent && !seen.has(parent) && kept.has(parent) ? parent : null };
  }) };
}

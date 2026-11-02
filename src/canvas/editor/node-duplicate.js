/** Duplicate mutable scene data while retaining immutable decoded media handles. */
function cloneSceneValue(value) {
  if (Array.isArray(value)) return value.map(cloneSceneValue);
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneSceneValue(entry)]));
}

export function cloneNodeForDuplicate(node) {
  return { ...cloneSceneValue(node), id: crypto.randomUUID(), locked: false };
}

/** Only copied node links change; component masters and asset IDs stay external. */
export function remapDuplicateReferences(copy, copiesById) {
  for (const field of ["parentId", "clipTo"]) {
    if (copy[field]) copy[field] = copiesById.get(copy[field])?.id ?? copy[field];
  }
  const remapSources = sources => {
    for (const source of sources ?? []) {
      if (source.id) source.id = copiesById.get(source.id)?.id ?? source.id;
      if (source.booleanSources) remapSources(source.booleanSources);
    }
  };
  remapSources(copy.sources);
  return copy;
}

/** Collect a complete subtree in paint order without repeated add/reflow passes. */
export function duplicateNodeTree(doc, rootId, offset) {
  const children = new Map();
  for (const node of doc.nodes) {
    // A clipping follower is part of its base's rendered unit even outside
    // the folder hierarchy, matching the ordinary clipboard move set.
    for (const anchor of [node.parentId, node.clipTo]) {
      if (!anchor) continue;
      const siblings = children.get(anchor) ?? [];
      siblings.push(node.id); children.set(anchor, siblings);
    }
  }
  const ids = new Set([rootId]), pending = [rootId];
  for (let index = 0; index < pending.length; index += 1) {
    for (const childId of children.get(pending[index]) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId); pending.push(childId);
    }
  }
  const copiesById = new Map();
  for (const node of doc.nodes) {
    if (!ids.has(node.id)) continue;
    const copy = cloneNodeForDuplicate(node);
    copy.x = (node.x ?? 0) + offset;
    copy.y = (node.y ?? 0) + offset;
    copiesById.set(node.id, copy);
  }
  const copies = [...copiesById.values()].map(copy => remapDuplicateReferences(copy, copiesById));
  const lastIndex = doc.nodes.findLastIndex(node => ids.has(node.id));
  return { id: copiesById.get(rootId).id,
    nodes: [...doc.nodes.slice(0, lastIndex + 1), ...copies, ...doc.nodes.slice(lastIndex + 1)] };
}

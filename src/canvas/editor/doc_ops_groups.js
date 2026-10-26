import {
  canCombine,
  createBooleanNode,
  groupDescendants,
  isContainerNode,
  isGroupNode,
  isRegionNode,
  NODE_KIND,
} from "./scene_model.js";
import { groupBlockInsertIndex, withNodes } from "./doc_ops_nodes.js";
import { moveAffectedIds } from "./doc_ops_move.js";
import { extremeOrder, moveNodeToExtreme } from "./doc_ops_groups_helpers.js";
import { reorderLayerBatch } from "./reorder-layer-batch.js";

export { extremeOrder, moveNodeToExtreme };

function sanitizeInvertedClipping(nodes) {
  const indexMap = new Map(nodes.map((node, i) => [node.id, i]));
  let changed = false;
  const result = nodes.map((node) => {
    if (node.clipTo) {
      const baseIndex = indexMap.get(node.clipTo);
      const nodeIndex = indexMap.get(node.id);
      if (baseIndex === undefined || baseIndex >= nodeIndex) {
        changed = true;
        const copy = { ...node };
        delete copy.clipTo;
        return copy;
      }
    }
    return node;
  });
  return changed ? result : nodes;
}

/**
 * Moves a node one step through the stack.
 *
 * `direction` is +1 for forward (towards the viewer) and -1 for backward. The
 * locked base image keeps the bottom slot, so nothing can be pushed under it,
 * and a node can never swap across the region plane's boundary.
 */
export function reorderNode(doc, id, direction) {
  const index = doc.nodes.findIndex((node) => node.id === id);
  if (index < 0) return doc;
  const target = index + direction;
  if (target < 0 || target >= doc.nodes.length) return doc;
  if (doc.nodes[target].locked) return doc;
  if (isRegionNode(doc.nodes[index]) !== isRegionNode(doc.nodes[target])) {
    return doc;
  }

  const nodes = [...doc.nodes];
  [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
  return withNodes(doc, sanitizeInvertedClipping(nodes));
}

/** Move selected siblings one step as a stable batch, without swapping them. */
export function reorderNodes(doc, ids, direction) {
  const nodes = reorderLayerBatch(doc, ids, direction);
  return nodes ? withNodes(doc, sanitizeInvertedClipping(nodes)) : doc;
}

/**
 * Moves a node to an arbitrary stack index — the drop half of drag-to-reorder.
 *
 * The same two invariants as `reorderNode` apply: a locked node keeps its
 * slot (the move may neither land on it nor push past it), and a node may
 * never cross the region plane's boundary in either direction. `targetIndex`
 * is the index the node should occupy after the move; it is clamped into
 * range, and a no-op returns the document unchanged so the caller can skip
 * the history entry.
 */
export function reorderNodeTo(doc, id, targetIndex) {
  const index = doc.nodes.findIndex((node) => node.id === id);
  if (index < 0) return doc;
  const node = doc.nodes[index];
  if (node.locked) return doc;
  if (!Number.isFinite(targetIndex)) return doc;
  const target = Math.max(
    0,
    Math.min(doc.nodes.length - 1, Math.round(targetIndex)),
  );
  if (target === index) return doc;
  if (isRegionNode(node) !== isRegionNode(doc.nodes[target])) return doc;

  const lo = Math.min(index, target);
  const hi = Math.max(index, target);
  for (let i = lo; i <= hi; i += 1) {
    if (i !== index && doc.nodes[i].locked) return doc;
  }

  const nodes = [...doc.nodes];
  nodes.splice(index, 1);
  nodes.splice(target, 0, node);
  return withNodes(doc, sanitizeInvertedClipping(nodes));
}

/**
 * Moves a node into a group as a member (Photoshop's drag-a-layer-onto-a-
 * folder): `parentId` is set and the node — a folder drags its whole subtree
 * — joins the group's block, so its stacking position sits inside the group
 * instead of jumping to the top of the document. Refuses when the target is
 * the node's own descendant, either side is locked, or the node is a region.
 */
export function moveIntoGroup(doc, id, groupId) {
  const node = doc.nodes.find((candidate) => candidate.id === id);
  const group = doc.nodes.find((candidate) => candidate.id === groupId);
  if (
    !node ||
    !isContainerNode(group) ||
    group.locked ||
    node.locked ||
    node.parentId === groupId ||
    isRegionNode(node)
  ) {
    return doc;
  }
  const blockIds = moveAffectedIds(doc, [id]);
  if (blockIds.includes(groupId)) return doc;
  const block = doc.nodes.filter((candidate) =>
    blockIds.includes(candidate.id),
  );
  const rest = doc.nodes.filter(
    (candidate) => !blockIds.includes(candidate.id),
  );
  const root = { ...node, parentId: groupId };
  const combined = [root, ...block.filter((candidate) => candidate.id !== id)];
  const insertAt = groupBlockInsertIndex(withNodes(doc, rest), root);
  const nodes = [...rest];
  nodes.splice(insertAt >= 0 ? insertAt : nodes.length, 0, ...combined);
  return withNodes(doc, nodes);
}

/**
 * Combines several shapes into a non-destructive boolean group container.
 *
 * The original shapes are kept intact as child nodes inside the boolean group,
 * allowing individual selection, direct editing, live updates, and ungrouping (Figma-style).
 * The result takes the stacking position of the bottom-most member in the stack.
 */
export function combineNodes(doc, ids, operation) {
  const chosen = new Set(ids ?? []);
  const members = doc.nodes.filter((node) => chosen.has(node.id));
  if (members.length === 1 && members[0].kind === NODE_KIND.BOOLEAN) {
    return {
      doc: withNodes(
        doc,
        doc.nodes.map((node) =>
          node.id === members[0].id ? { ...node, operation } : node,
        ),
      ),
      id: members[0].id,
    };
  }
  if (!canCombine(members)) return { doc, id: null };

  const [bottomMost] = members;
  const parentId = bottomMost?.parentId ?? null;
  const combined = createBooleanNode(members, operation, parentId);

  let bottomIndex = doc.nodes.length;
  doc.nodes.forEach((node, index) => {
    if (chosen.has(node.id) && index < bottomIndex) bottomIndex = index;
  });

  const nodes = doc.nodes.map((node) =>
    chosen.has(node.id) ? { ...node, parentId: combined.id } : node,
  );
  nodes.splice(bottomIndex, 0, combined);

  return {
    doc: withNodes(doc, nodes),
    id: combined.id,
  };
}

/**
 * Wraps nodes in a new folder.
 *
 * `childIds` are the direct children — the caller picks the top-level units,
 * so nesting a group inside the new one is just passing its id alongside the
 * loose nodes. The folder slots in directly above its topmost child, which is
 * where the layers panel anchors it; the folder itself never paints, so its
 * index means nothing to the renderers.
 */
export function insertGroup(doc, groupNode, childIds) {
  const chosen = new Set(childIds);
  if (!doc.nodes.some((node) => chosen.has(node.id))) return doc;
  let bottomIndex = doc.nodes.length;
  doc.nodes.forEach((node, index) => {
    if (chosen.has(node.id) && index < bottomIndex) bottomIndex = index;
  });
  const nodes = doc.nodes.map((node) =>
    chosen.has(node.id) ? { ...node, parentId: groupNode.id } : node,
  );
  nodes.splice(bottomIndex, 0, groupNode);
  return withNodes(doc, nodes);
}

/**
 * Dissolves folders and boolean containers: their children keep their slots
 * and lose only the `parentId` — ungrouping never changes what covers what.
 */
export function ungroupNodes(doc, groupIds) {
  const gone = new Set(groupIds);
  const dissolvable = (node) =>
    (isGroupNode(node) || node.kind === NODE_KIND.BOOLEAN) && gone.has(node.id);
  if (!doc.nodes.some(dissolvable)) {
    return doc;
  }

  // Find parents of dissolved containers so children inherit parent's parentId
  const parentMap = new Map(
    doc.nodes
      .filter((node) => gone.has(node.id))
      .map((node) => [node.id, node.parentId ?? null]),
  );

  return withNodes(
    doc,
    doc.nodes
      .filter((node) => !dissolvable(node))
      .map((node) =>
        node.parentId && gone.has(node.parentId)
          ? { ...node, parentId: parentMap.get(node.parentId) ?? null }
          : node,
      ),
  );
}

/**
 * Drops every folder or boolean container left with no members — the cleanup pass after deletions.
 * A folder that lost its children to a delete is an empty row in the panel
 * that can never be filled again; Photoshop removes it with the last child.
 * Loops because emptying a nested folder empties its parent in turn.
 */
export function pruneEmptyGroups(doc) {
  let current = doc;
  for (;;) {
    const parentIds = new Set(
      current.nodes
        .filter((node) => node.parentId)
        .map((node) => node.parentId),
    );
    const empty = current.nodes.filter(
      (node) =>
        (isGroupNode(node) || node.kind === NODE_KIND.BOOLEAN) &&
        !parentIds.has(node.id),
    );
    if (empty.length === 0) return current;
    const gone = new Set(empty.map((node) => node.id));
    current = withNodes(
      current,
      current.nodes
        .filter((node) => !gone.has(node.id))
        .map((node) =>
          node.parentId && gone.has(node.parentId)
            ? { ...node, parentId: null }
            : node,
        ),
    );
  }
}

/**
 * Moves a folder and everything inside it as one block — the drop half of
 * dragging a group row in the layers panel. Members become contiguous behind
 * the folder, which matches how every editor stacks a group's contents.
 */
export function reorderGroupTo(doc, groupId, targetIndex) {
  const group = doc.nodes.find((node) => node.id === groupId);
  if (!isContainerNode(group) || group.locked) return doc;
  if (!Number.isFinite(targetIndex)) return doc;
  const blockIds = new Set([
    groupId,
    ...groupDescendants(doc, groupId).map((node) => node.id),
  ]);
  const block = doc.nodes.filter((node) => blockIds.has(node.id));
  const rest = doc.nodes.filter((node) => !blockIds.has(node.id));
  if (rest.some((node) => node.locked)) {
    // The locked base image keeps the bottom slot: clamp the drop above it.
    const firstLocked = rest.findIndex((node) => node.locked);
    if (firstLocked >= 0 && targetIndex <= firstLocked) {
      targetIndex = firstLocked + 1;
    }
  }
  const target = Math.max(0, Math.min(rest.length, Math.round(targetIndex)));
  return withNodes(
    doc,
    sanitizeInvertedClipping([
      ...rest.slice(0, target),
      ...block,
      ...rest.slice(target),
    ]),
  );
}

/**
 * Moves a group member (or any node) out to the root plane at a target root
 * position, clearing its `parentId` — the drop half of "drag a layer out of
 * its folder". The moved unit travels as one block (a folder member's own
 * subtree, and its clipping-mask followers, ride along), and its descendants
 * keep their parentIds pointing inside the unit.
 *
 * `targetRootIndex` is a 0-based position among the root (parentless) nodes
 * after the unit is lifted out; clamp so a locked base keeps the bottom slot
 * and the move never lands on a locked node. Refuses (returns the document
 * unchanged) when the node is locked, a region, or missing — so the caller
 * can skip the history entry.
 */
export function moveNodeToRoot(doc, id, targetRootIndex) {
  const node = doc.nodes.find((candidate) => candidate.id === id);
  if (!node || node.locked || isRegionNode(node)) return doc;
  const blockIds = moveAffectedIds(doc, [id]);
  const block = doc.nodes.filter((candidate) =>
    blockIds.includes(candidate.id),
  );
  const rest = doc.nodes.filter(
    (candidate) => !blockIds.includes(candidate.id),
  );
  // The root slots are the TRUE top-level rows that remain after the lift. A
  // clip follower is parentless but renders indented beneath its base, so it is
  // not a placement target — counting it here would shift every root index by
  // the number of clip followers and break "drop above the group" (the panel
  // excludes clip followers from its drag rows too).
  const roots = rest.filter(
    (candidate) => !candidate.parentId && !candidate.clipTo,
  );
  let at = Math.max(0, Math.min(roots.length, Math.round(targetRootIndex)));
  // A locked node keeps its slot: the lifted unit may not be placed on or
  // below the first locked node above the target (the base image).
  const firstLocked = rest.findIndex((candidate) => candidate.locked);
  if (firstLocked >= 0 && at > firstLocked) at = firstLocked;
  const flatIndex =
    at >= roots.length
      ? rest.length
      : rest.findIndex((candidate) => candidate.id === roots[at].id);
  // Detach the unit's root from its parent; descendants stay under the unit.
  const detached = block.map((candidate) =>
    candidate.id === id ? { ...candidate, parentId: null } : candidate,
  );
  return withNodes(
    doc,
    sanitizeInvertedClipping([
      ...rest.slice(0, flatIndex),
      ...detached,
      ...rest.slice(flatIndex),
    ]),
  );
}

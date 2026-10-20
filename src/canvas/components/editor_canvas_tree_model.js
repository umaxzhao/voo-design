import {
  describeNode,
  isGroupNode,
  isBooleanNode,
  isContainerNode,
} from "../editor/scene_model.js";

/**
 * Builds display rows for an inactive canvas in front-to-back order
 * (reverse of document paint order), preserving groups and clipping chains,
 * recovering broken/legacy parent links, breaking cycles, and supporting
 * optional group disclosure (collapsing).
 *
 * @param {Array} nodes Flat array of document nodes in paint order.
 * @param {Object} labels Custom labels dictionary.
 * @param {string} query Search/filter string.
 * @param {Set|Array|Object} options Options object or collapsedGroupIds set.
 * @returns {Array<{node: Object, index: number, depth: number, isGroup: boolean, hasChildren: boolean, isCollapsed: boolean}>}
 */
export function buildInactiveCanvasRows(
  nodes = [],
  labels = {},
  query = "",
  options = {},
) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const collapsedSet =
    options instanceof Set
      ? options
      : new Set(
          Array.isArray(options?.collapsedGroupIds)
            ? options.collapsedGroupIds
            : options?.collapsedGroupIds instanceof Set
              ? options.collapsedGroupIds
              : [],
        );

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const docIndexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const childrenMap = new Map();
  const clipMap = new Map();
  const roots = [];

  for (const node of nodes) {
    const hasValidParent =
      Boolean(node.parentId) &&
      node.parentId !== node.id &&
      byId.has(node.parentId);
    const hasValidClip =
      Boolean(node.clipTo) &&
      node.clipTo !== node.id &&
      byId.has(node.clipTo);

    if (hasValidParent) {
      if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
      childrenMap.get(node.parentId).push(node);
    } else if (hasValidClip) {
      if (!clipMap.has(node.clipTo)) clipMap.set(node.clipTo, []);
      clipMap.get(node.clipTo).push(node);
    } else {
      roots.push(node);
    }
  }

  const normalizedQuery = (query || "").trim().toLowerCase();

  const subtreeMatches = (node, seen = new Set()) => {
    if (!normalizedQuery) return true;
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    const label = describeNode(node, docIndexOf.get(node.id) ?? 0, labels);
    if (label.toLowerCase().includes(normalizedQuery)) return true;

    for (const child of childrenMap.get(node.id) ?? []) {
      if (subtreeMatches(child, seen)) return true;
    }
    for (const member of clipMap.get(node.id) ?? []) {
      if (subtreeMatches(member, seen)) return true;
    }
    return false;
  };

  const rows = [];
  const visited = new Set();

  const pushRow = (node, depth) => {
    if (visited.has(node.id)) return;
    if (normalizedQuery && !subtreeMatches(node)) return;

    visited.add(node.id);

    const isGroup = isGroupNode(node) || isBooleanNode(node) || isContainerNode(node);
    const children = childrenMap.get(node.id) ?? [];
    const clips = clipMap.get(node.id) ?? [];
    const hasChildren = children.length > 0 || clips.length > 0;
    // When searching, reveal matching descendants by not collapsing
    const isCollapsed = normalizedQuery ? false : collapsedSet.has(node.id);

    rows.push({
      node,
      index: docIndexOf.get(node.id) ?? 0,
      depth,
      isGroup,
      hasChildren,
      isCollapsed: Boolean(isCollapsed),
    });

    if (!isCollapsed) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        pushRow(children[i], depth + 1);
      }
      for (let i = clips.length - 1; i >= 0; i -= 1) {
        pushRow(clips[i], depth + 1);
      }
    }
  };

  const hasVisitedAncestor = (node) => {
    let curr = node;
    const seen = new Set();
    while (curr) {
      if (seen.has(curr.id)) break;
      seen.add(curr.id);
      const parentId = curr.parentId || curr.clipTo;
      if (!parentId || !byId.has(parentId)) return false;
      if (visited.has(parentId)) return true;
      curr = byId.get(parentId);
    }
    return false;
  };

  // Traverse roots in front-to-back order (reverse document paint order)
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    pushRow(roots[i], 0);
  }

  // Fallback sweep: recover any cyclic or detached nodes so 100% of nodes are accounted for
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!visited.has(node.id) && !hasVisitedAncestor(node)) {
      pushRow(node, 0);
    }
  }

  return rows;
}

/**
 * Checks whether an inactive canvas or any of its layers match the search query.
 */
export function checkCanvasMatch(page, query = "", labels = {}) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return { matchesSelf: true, matchingLayersCount: page.nodes?.length ?? 0 };
  const matchesSelf = (page.title || "").toLowerCase().includes(q);
  const count = buildInactiveCanvasRows(page.nodes || [], labels, q).length;
  return { matchesSelf, matchingLayersCount: count };
}

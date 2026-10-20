import { getNodeVisualSize } from "./node-position.js";

const COLUMN_GAP = 130;
const ROW_GAP = 80;

/** Layered left-to-right layout using each node's measured or configured size. */
export function layoutWorkflowNodes(nodes, edges, onlyNodeIds = null) {
  const included = nodes.filter(
    (node) => !node.parentNode && (!onlyNodeIds || onlyNodeIds.has(node.id)),
  );
  if (included.length < 2) return nodes;
  const ids = new Set(included.map((node) => node.id));
  const graphEdges = edges.filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );
  const incoming = new Map(included.map((node) => [node.id, 0]));
  const outgoing = new Map(included.map((node) => [node.id, []]));
  graphEdges.forEach((edge) => {
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  });

  const levels = new Map();
  const queue = included.filter((node) => incoming.get(node.id) === 0);
  queue.forEach((node) => levels.set(node.id, 0));
  while (queue.length) {
    const node = queue.shift();
    for (const target of outgoing.get(node.id)) {
      levels.set(
        target,
        Math.max(levels.get(target) ?? 0, levels.get(node.id) + 1),
      );
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0)
        queue.push(included.find((item) => item.id === target));
    }
  }
  // Cyclic or disconnected remnants still get a deterministic final column.
  included.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  });

  const columns = new Map();
  included.forEach((node) => {
    const level = levels.get(node.id);
    columns.set(level, [...(columns.get(level) ?? []), node]);
  });
  const orderedLevels = [...columns.keys()].sort((a, b) => a - b);
  const anchorX = Math.min(...included.map((node) => node.position.x));
  const anchorY = Math.min(...included.map((node) => node.position.y));
  const positions = new Map();
  let x = anchorX;

  orderedLevels.forEach((level) => {
    const column = columns
      .get(level)
      .sort(
        (a, b) =>
          (a.data?.sceneNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.data?.sceneNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.position.y - b.position.y,
      );
    const maxWidth = Math.max(
      ...column.map((node) => getNodeVisualSize(node).width),
    );
    let y = anchorY;
    column.forEach((node) => {
      positions.set(node.id, { x, y });
      y += getNodeVisualSize(node).height + ROW_GAP;
    });
    x += maxWidth + COLUMN_GAP;
  });

  return nodes.map((node) =>
    positions.has(node.id)
      ? { ...node, position: positions.get(node.id) }
      : node,
  );
}

/**
 * Tidy only the specified subset of node IDs by their edges.
 *
 * Visual rules match layoutWorkflowNodes.
 * Anchors at the subset's top-left, or just right of the upstream node if all
 * incoming edges to the subset originate from a single outside node.
 * Shifts the entire block vertically as needed so no node in the subset
 * overlaps any node outside the subset.
 * Group members (nodes carrying parentNode) are untouched.
 */
export function layoutScopedNodes(nodes, edges, targetNodeIds) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  if (!targetNodeIds) return nodes;
  const ids = targetNodeIds instanceof Set ? targetNodeIds : new Set(targetNodeIds);
  if (ids.size === 0) return nodes;

  // Group members stay with their Group: skip nodes that have a parentNode.
  const included = nodes.filter(
    (node) => ids.has(node.id) && !node.parentNode,
  );
  if (included.length === 0) return nodes;

  const includedIds = new Set(included.map((node) => node.id));
  const graphEdges = edges.filter(
    (edge) => includedIds.has(edge.source) && includedIds.has(edge.target),
  );
  const incoming = new Map(included.map((node) => [node.id, 0]));
  const outgoing = new Map(included.map((node) => [node.id, []]));
  graphEdges.forEach((edge) => {
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  });

  const levels = new Map();
  const queue = included.filter((node) => incoming.get(node.id) === 0);
  queue.forEach((node) => levels.set(node.id, 0));
  while (queue.length) {
    const node = queue.shift();
    for (const target of outgoing.get(node.id)) {
      levels.set(
        target,
        Math.max(levels.get(target) ?? 0, levels.get(node.id) + 1),
      );
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) {
        queue.push(included.find((item) => item.id === target));
      }
    }
  }
  included.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  });

  const columns = new Map();
  included.forEach((node) => {
    const level = levels.get(node.id);
    columns.set(level, [...(columns.get(level) ?? []), node]);
  });
  const orderedLevels = [...columns.keys()].sort((a, b) => a - b);

  // Compute relative coordinates starting at (0, 0)
  const relativePositions = new Map();
  let relX = 0;
  orderedLevels.forEach((level) => {
    const column = columns
      .get(level)
      .sort(
        (a, b) =>
          (a.data?.sceneNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.data?.sceneNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.position.y - b.position.y,
      );
    const maxWidth = Math.max(
      ...column.map((node) => getNodeVisualSize(node).width),
    );
    let relY = 0;
    column.forEach((node) => {
      relativePositions.set(node.id, { x: relX, y: relY });
      relY += getNodeVisualSize(node).height + ROW_GAP;
    });
    relX += maxWidth + COLUMN_GAP;
  });

  // Determine anchor: right of upstream node if single source outside subset, else top-left
  const incomingFromOutside = edges.filter(
    (edge) => includedIds.has(edge.target) && !includedIds.has(edge.source),
  );
  const upstreamSources = [
    ...new Set(incomingFromOutside.map((edge) => edge.source)),
  ];

  let anchorX;
  let anchorY;

  if (upstreamSources.length === 1) {
    const upstreamNode = nodes.find((n) => n.id === upstreamSources[0]);
    if (upstreamNode) {
      const uSize = getNodeVisualSize(upstreamNode);
      anchorX = upstreamNode.position.x + uSize.width + COLUMN_GAP;
      anchorY = upstreamNode.position.y;
    } else {
      anchorX = Math.min(...included.map((node) => node.position.x));
      anchorY = Math.min(...included.map((node) => node.position.y));
    }
  } else {
    anchorX = Math.min(...included.map((node) => node.position.x));
    anchorY = Math.min(...included.map((node) => node.position.y));
  }

  // Shift block downwards to avoid overlapping any outside node
  const outsideNodes = nodes.filter(
    (node) => !includedIds.has(node.id) && !node.parentNode,
  );
  const outsideBoxes = outsideNodes.map((node) => {
    const size = getNodeVisualSize(node);
    return {
      id: node.id,
      x1: node.position.x,
      y1: node.position.y,
      x2: node.position.x + size.width,
      y2: node.position.y + size.height,
    };
  });

  let currX = anchorX;
  let currY = anchorY;
  const MAX_SHIFT_ATTEMPTS = 50;

  for (let attempt = 0; attempt < MAX_SHIFT_ATTEMPTS; attempt++) {
    let overlappingOutside = false;
    let requiredY = currY;

    for (const node of included) {
      const rel = relativePositions.get(node.id);
      const size = getNodeVisualSize(node);
      const nodeBox = {
        x1: currX + rel.x,
        y1: currY + rel.y,
        x2: currX + rel.x + size.width,
        y2: currY + rel.y + size.height,
      };

      for (const out of outsideBoxes) {
        const overlaps =
          nodeBox.x1 < out.x2 &&
          nodeBox.x2 > out.x1 &&
          nodeBox.y1 < out.y2 &&
          nodeBox.y2 > out.y1;

        if (overlaps) {
          overlappingOutside = true;
          const shiftY = out.y2 + ROW_GAP - rel.y;
          if (shiftY > requiredY) {
            requiredY = shiftY;
          }
        }
      }
    }

    if (!overlappingOutside) {
      break;
    }

    if (requiredY > currY) {
      currY = requiredY;
    } else {
      currY += ROW_GAP;
    }
  }

  const finalPositions = new Map();
  included.forEach((node) => {
    const rel = relativePositions.get(node.id);
    finalPositions.set(node.id, {
      x: currX + rel.x,
      y: currY + rel.y,
    });
  });

  return nodes.map((node) =>
    finalPositions.has(node.id)
      ? { ...node, position: finalPositions.get(node.id) }
      : node,
  );
}

export { layoutScopedNodes as layoutScopedWorkflowNodes };

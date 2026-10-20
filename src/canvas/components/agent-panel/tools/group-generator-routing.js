/**
 * Routing helper for multi-generator outputs into a Group node.
 *
 * When the Agent creates multiple image generation nodes at once, their outputs
 * must route to a groupNode so that results are ingested and saved into the
 * canvas document/gallery (via ingestResultsIntoGroup / appendResultsToGalleries).
 *
 * Rules:
 * 0. A caller-supplied preferredGroupId wins outright — used for the output
 *    Group a bound Agent Gen node already collects into.
 * 1. If an existing Group is on the canvas:
 *    - Prioritize a Group connected to related nodes (e.g. prompt/reference inputs).
 *    - If multiple (or none) connected to related nodes, pick the closest by Euclidean distance.
 * 2. If no Group exists, create a new Group node positioned to the right of the generators.
 * 3. Connect each unconnected generator's 'image' output to the Group's 'media' input.
 */

import { HANDLE, NODE_TYPE } from "../../../nodes/node_enums.js";

/**
 * Checks whether a node type is an image generator.
 */
export function isImageGeneratorType(type) {
  return (
    type === NODE_TYPE.GENERATE ||
    type === NODE_TYPE.API_IMAGE ||
    type === "generate" ||
    type === "apiImage"
  );
}

/**
 * Ensures that multiple image generation nodes route their outputs to a groupNode.
 *
 * @param {Object} options
 * @param {Object} options.store - The canvas Zustand store or compatible store interface
 * @param {Array} options.generatorNodes - Array of generator node objects or node IDs
 * @param {Array} [options.relatedNodeIds] - Optional array of related node IDs (e.g. inputs/reference)
 * @param {string|null} [options.preferredGroupId] - Group that must win over the
 *   distance/relatedness heuristics — e.g. the output Group a bound Agent Gen
 *   node already collects into. Without it the heuristics can pick a different
 *   Group and split the same artifacts across two.
 * @returns {Object|null} Routing result { groupId, createdGroup, connectedCount } or null
 */
export function ensureGroupForImageGenerators({
  store,
  generatorNodes = [],
  relatedNodeIds = [],
  preferredGroupId = null,
}) {
  if (!store) return null;

  const currentNodes =
    store.nodes ||
    (typeof store.get === "function" ? store.get()?.nodes : []) ||
    [];
  const currentEdges =
    store.edges ||
    (typeof store.get === "function" ? store.get()?.edges : []) ||
    [];

  // Normalize generator nodes to objects with id, type, and position
  const normalizedGenerators = generatorNodes
    .map((item) => {
      if (typeof item === "string") {
        const found = currentNodes.find((n) => n.id === item);
        return (
          found || {
            id: item,
            type: NODE_TYPE.GENERATE,
            position: { x: 400, y: 200 },
          }
        );
      }
      return item;
    })
    .filter((node) => Boolean(node?.id) && isImageGeneratorType(node.type));

  // The rule applies when creating multiple image generation nodes (>= 2)
  if (normalizedGenerators.length < 2) {
    return null;
  }

  // Find all existing Group nodes
  const existingGroups = currentNodes.filter((n) => n.type === NODE_TYPE.GROUP);

  // Check which generators are not yet connected to a group
  const unconnectedGenerators = normalizedGenerators.filter((gen) => {
    return !currentEdges.some(
      (edge) =>
        edge.source === gen.id &&
        currentNodes.some(
          (n) => n.id === edge.target && n.type === NODE_TYPE.GROUP,
        ),
    );
  });

  if (unconnectedGenerators.length === 0) {
    // All generators already have a downstream Group connection
    return null;
  }

  // Calculate centroid of the generator nodes
  const positions = normalizedGenerators
    .map((g) => g.position)
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const centroidX =
    positions.length > 0
      ? positions.reduce((acc, p) => acc + p.x, 0) / positions.length
      : 400;
  const centroidY =
    positions.length > 0
      ? positions.reduce((acc, p) => acc + p.y, 0) / positions.length
      : 200;

  // Build the set of related node IDs
  const genIds = new Set(normalizedGenerators.map((g) => g.id));
  const allRelatedIds = new Set([
    ...relatedNodeIds.filter(Boolean),
    // Source nodes feeding into these generators
    ...currentEdges.filter((e) => genIds.has(e.target)).map((e) => e.source),
    // Or target nodes fed by these generators
    ...currentEdges.filter((e) => genIds.has(e.source)).map((e) => e.target),
  ]);

  // Priority 0: an explicitly preferred Group always wins over the heuristics
  // below, so a bound Agent Gen session collects into its own output Group
  // instead of having its artifacts split across two Groups.
  let targetGroup = preferredGroupId
    ? (existingGroups.find((group) => group.id === preferredGroupId) ?? null)
    : null;

  if (!targetGroup && existingGroups.length > 0) {
    // Priority 1: Groups connected to related nodes (or containing related nodes)
    const connectedGroups = existingGroups.filter((group) => {
      if (allRelatedIds.has(group.id)) return true;
      return (
        currentEdges.some(
          (e) =>
            (e.source === group.id && allRelatedIds.has(e.target)) ||
            (e.target === group.id && allRelatedIds.has(e.source)),
        ) ||
        currentNodes.some(
          (n) => n.parentNode === group.id && allRelatedIds.has(n.id),
        )
      );
    });

    const candidates =
      connectedGroups.length > 0 ? connectedGroups : existingGroups;

    // Pick the candidate closest by Euclidean distance to the centroid
    let minDistance = Infinity;
    for (const group of candidates) {
      const gx = group.position?.x ?? 0;
      const gy = group.position?.y ?? 0;
      const dist = Math.hypot(gx - centroidX, gy - centroidY);
      if (dist < minDistance) {
        minDistance = dist;
        targetGroup = group;
      }
    }
  }

  let createdNewGroup = false;
  if (!targetGroup) {
    // Priority 2: Create a new Group node if none exists
    if (typeof store.addNode !== "function") {
      return null;
    }

    let maxX = -Infinity;
    let minY = Infinity;
    for (const g of normalizedGenerators) {
      const x = g.position?.x ?? 400;
      const y = g.position?.y ?? 200;
      const w = g.width || 300;
      if (x + w > maxX) maxX = x + w;
      if (y < minY) minY = y;
    }
    if (!Number.isFinite(maxX)) maxX = 400;
    if (!Number.isFinite(minY)) minY = 200;

    const groupPosition = {
      x: maxX + 100,
      y: minY,
    };

    const newGroupId = store.addNode(NODE_TYPE.GROUP, groupPosition);
    if (!newGroupId) return null;

    // addNode already wrote the Group into the store. `store.nodes` is the
    // array from before that call, so it is only read, never pushed to: it
    // may still be referenced by an undo snapshot.
    targetGroup = {
      id: newGroupId,
      type: NODE_TYPE.GROUP,
      position: groupPosition,
    };
    createdNewGroup = true;
  }

  // Connect unconnected generators to the targetGroup
  const connections = unconnectedGenerators.map((gen) => ({
    source: gen.id,
    target: targetGroup.id,
    sourceHandle: HANDLE.IMAGE,
    targetHandle: HANDLE.MEDIA,
  }));

  if (typeof store.batchConnectNodes === "function") {
    store.batchConnectNodes(connections);
  } else if (typeof store.onConnect === "function") {
    for (const conn of connections) {
      store.onConnect(conn);
    }
  } else if (Array.isArray(store.edges)) {
    store.edges.push(
      ...connections.map((conn, i) => ({
        ...conn,
        id: `auto-group-edge-${Date.now()}-${i}`,
      })),
    );
  }

  return {
    groupId: targetGroup.id,
    createdGroup: createdNewGroup,
    connectedCount: connections.length,
  };
}

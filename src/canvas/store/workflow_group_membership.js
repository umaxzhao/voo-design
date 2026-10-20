import { OUTPUT_GROUP_LAYOUT } from "../nodes/output_group_schema.js";
import { getNodeTypeDefinition } from "../nodes/registry.js";
import { ensureValidParentNodes, NODE_TYPE } from "../nodes/types.js";

function finiteSize(...values) {
  for (const value of values) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function nodeSize(node) {
  const registered = getNodeTypeDefinition(node.type)?.size;
  return {
    width: finiteSize(
      node.style?.width,
      node.width,
      node.measured?.width,
      registered?.width,
      OUTPUT_GROUP_LAYOUT.cellW,
    ),
    height: finiteSize(
      node.style?.height,
      node.height,
      node.measured?.height,
      registered?.height,
      OUTPUT_GROUP_LAYOUT.cellH,
    ),
  };
}

function absolutePosition(node, nodesById) {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let parentId = node.parentNode;
  const visited = new Set([node.id]);

  while (parentId) {
    if (visited.has(parentId)) {
      throw new Error(`Group membership cycle detected at ${parentId}`);
    }
    visited.add(parentId);
    const parent = nodesById.get(parentId);
    if (!parent) break;
    x += parent.position?.x ?? 0;
    y += parent.position?.y ?? 0;
    parentId = parent.parentNode;
  }

  return { x, y };
}

/**
 * Pure reducer for Group mutation entry points that adopt existing nodes.
 * `parentNode` remains the only membership owner. The Group expands around a
 * newly adopted node while every existing node keeps its absolute position.
 */
export function addNodesToGroup({ nodes, groupId, nodeIds }) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return null;

  let workingNodes = nodes;
  let changed = false;
  const uniqueNodeIds = [...new Set(nodeIds)];

  for (const nodeId of uniqueNodeIds) {
    const nodesById = new Map(workingNodes.map((node) => [node.id, node]));
    const group = nodesById.get(groupId);
    const source = nodesById.get(nodeId);
    if (!group || group.type !== NODE_TYPE.GROUP) {
      throw new Error(`Group not found: ${groupId}`);
    }
    if (!source) throw new Error(`Group member not found: ${nodeId}`);
    if (source.id === group.id || source.type === NODE_TYPE.GROUP) {
      throw new Error("A Group cannot become a Group member");
    }
    if (source.parentNode === group.id) continue;

    const sourceAbsolute = absolutePosition(source, nodesById);
    const groupAbsolute = absolutePosition(group, nodesById);
    const sourceSize = nodeSize(source);
    const groupSize = nodeSize(group);
    const { pad, padTop } = OUTPUT_GROUP_LAYOUT;
    const initialRelative = {
      x: sourceAbsolute.x - groupAbsolute.x,
      y: sourceAbsolute.y - groupAbsolute.y,
    };
    const shiftX = Math.max(0, pad - initialRelative.x);
    const shiftY = Math.max(0, padTop - initialRelative.y);
    const nextRelative = {
      x: initialRelative.x + shiftX,
      y: initialRelative.y + shiftY,
    };
    const nextWidth = Math.max(
      groupSize.width + shiftX,
      nextRelative.x + sourceSize.width + pad,
    );
    const nextHeight = Math.max(
      groupSize.height + shiftY,
      nextRelative.y + sourceSize.height + pad,
    );

    workingNodes = workingNodes.map((node) => {
      if (node.id === group.id) {
        return {
          ...node,
          position: {
            x: (node.position?.x ?? 0) - shiftX,
            y: (node.position?.y ?? 0) - shiftY,
          },
          style: {
            ...(node.style ?? {}),
            width: nextWidth,
            height: nextHeight,
          },
        };
      }
      if (node.id === source.id) {
        return {
          ...node,
          parentNode: group.id,
          position: nextRelative,
          selected: false,
        };
      }
      if (node.parentNode === group.id && (shiftX > 0 || shiftY > 0)) {
        return {
          ...node,
          position: {
            x: (node.position?.x ?? 0) + shiftX,
            y: (node.position?.y ?? 0) + shiftY,
          },
        };
      }
      return node;
    });
    changed = true;
  }

  return changed ? ensureValidParentNodes(workingNodes) : null;
}

import { createToolError, TOOL_ERROR_CODE } from "./errors.js";

const NODE_LOOKUP_SUGGESTION = Object.freeze({
  tool: "list_nodes",
  args: {},
  note: "Call list_nodes to get valid node ids, then retry.",
});

export function hasOwnArgument(args, name) {
  return Object.prototype.hasOwnProperty.call(args, name);
}

export function assertExclusiveNodeSelector(args, selectors) {
  const provided = selectors.filter((name) => hasOwnArgument(args, name));
  if (provided.length === 1) return provided[0];

  const message =
    provided.length === 0
      ? `Provide exactly one of: ${selectors.join(", ")}.`
      : `Node selectors cannot be combined: ${provided.join(", ")}.`;
  throw createToolError(TOOL_ERROR_CODE.ARGS_INVALID, message, {
    missing: provided.length === 0 ? { args: selectors } : null,
    suggestion: {
      tool: null,
      args: {},
      note: `Choose exactly one node selector and retry: ${selectors.join(", ")}.`,
    },
  });
}

export function normalizeBatchNodeIds(value, argumentName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      `${argumentName} must be a non-empty array of node IDs.`,
      { missing: { args: [argumentName] } },
    );
  }

  const invalidIndexes = [];
  value.forEach((nodeId, index) => {
    if (typeof nodeId !== "string" || nodeId.trim() === "") {
      invalidIndexes.push(index);
    }
  });
  if (invalidIndexes.length > 0) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      `${argumentName} contains invalid node IDs at indexes: ${invalidIndexes.join(", ")}.`,
      { missing: { args: [argumentName] } },
    );
  }

  const duplicateIds = value.filter(
    (nodeId, index) => value.indexOf(nodeId) !== index,
  );
  if (duplicateIds.length > 0) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      `${argumentName} contains duplicate node IDs: ${[...new Set(duplicateIds)].join(", ")}.`,
      { missing: { args: [argumentName] } },
    );
  }

  return [...value];
}

export function assertBatchPatch(data, position, path) {
  if (
    data !== undefined &&
    (data === null || typeof data !== "object" || Array.isArray(data))
  ) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      `${path}.data must be an object when provided.`,
      { missing: { args: [`${path}.data`] } },
    );
  }
  if (
    position !== undefined &&
    (position === null ||
      typeof position !== "object" ||
      Array.isArray(position))
  ) {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      `${path}.position must be an object when provided.`,
      { missing: { args: [`${path}.position`] } },
    );
  }
  for (const coordinate of ["x", "y"]) {
    if (
      position?.[coordinate] !== undefined &&
      !Number.isFinite(position[coordinate])
    ) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `${path}.position.${coordinate} must be a finite number.`,
        { missing: { args: [`${path}.position.${coordinate}`] } },
      );
    }
  }
}

export function findMissingNodeIds(nodes, nodeIds) {
  const existingIds = new Set(nodes.map((node) => node.id));
  return nodeIds.filter((nodeId) => !existingIds.has(nodeId));
}

export function atomicNodeFailureOptions(nodeIds, missingNodeIds) {
  const invalidIds = new Set(missingNodeIds);
  return {
    missing: { nodes: missingNodeIds },
    details: {
      totalRequested: nodeIds.length,
      validNodeIds: nodeIds.filter((nodeId) => !invalidIds.has(nodeId)),
      invalidNodeIds: missingNodeIds,
    },
    suggestion: NODE_LOOKUP_SUGGESTION,
  };
}

export function requireBatchStoreAction(store, actionName) {
  if (typeof store[actionName] === "function") return;
  throw createToolError(
    TOOL_ERROR_CODE.STORE_UNAVAILABLE,
    `Store action is not available: ${actionName}`,
    {
      missing: { store: [actionName] },
      suggestion: {
        tool: null,
        args: {},
        note: "Open the workflow canvas in a supported VOO environment, then retry.",
      },
    },
  );
}

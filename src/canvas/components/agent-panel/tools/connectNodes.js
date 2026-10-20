/**
 * Tool: connect_nodes — Create an edge between two nodes.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { hasOwnArgument, requireBatchStoreAction } from "./node-batch.js";
import { t } from "../../../../shared/i18n.js";

const def = getWorkflowToolDefinition("connect_nodes");
const CONNECTION_FIELDS = [
  "sourceId",
  "targetId",
  "sourceHandle",
  "targetHandle",
];

function invalidConnectionArguments(message, missing = null) {
  return createToolError(TOOL_ERROR_CODE.ARGS_INVALID, message, {
    missing,
    suggestion: {
      tool: null,
      args: {},
      note: "Use either all four single-edge fields or a non-empty edges list, then retry.",
    },
  });
}

function normalizeConnection(connection, path) {
  if (
    connection === null ||
    typeof connection !== "object" ||
    Array.isArray(connection)
  ) {
    throw invalidConnectionArguments(`${path} must be an edge object.`, {
      args: [path],
    });
  }

  const missingFields = CONNECTION_FIELDS.filter(
    (field) =>
      typeof connection[field] !== "string" || connection[field].trim() === "",
  );
  if (missingFields.length > 0) {
    throw invalidConnectionArguments(
      `${path} is missing valid connection fields: ${missingFields.join(", ")}.`,
      { args: missingFields.map((field) => `${path}.${field}`) },
    );
  }

  const extraFields = Object.keys(connection).filter(
    (field) => !CONNECTION_FIELDS.includes(field),
  );
  if (extraFields.length > 0) {
    throw invalidConnectionArguments(
      `${path} contains unsupported fields: ${extraFields.join(", ")}.`,
    );
  }

  return {
    source: connection.sourceId,
    target: connection.targetId,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
  };
}

function normalizeConnectionBatch(args) {
  const hasEdges = hasOwnArgument(args, "edges");
  const singleFields = CONNECTION_FIELDS.filter((field) =>
    hasOwnArgument(args, field),
  );
  if (!hasEdges) {
    if (singleFields.length !== CONNECTION_FIELDS.length) {
      const missingFields = CONNECTION_FIELDS.filter(
        (field) => !singleFields.includes(field),
      );
      throw invalidConnectionArguments(
        `Missing required connection fields: ${missingFields.join(", ")}.`,
        { args: missingFields },
      );
    }
    return null;
  }
  if (singleFields.length > 0) {
    throw invalidConnectionArguments(
      `edges cannot be combined with single-edge fields: ${singleFields.join(", ")}.`,
    );
  }
  if (!Array.isArray(args.edges) || args.edges.length === 0) {
    throw invalidConnectionArguments("edges must be a non-empty array.", {
      args: ["edges"],
    });
  }
  return args.edges.map((connection, index) =>
    normalizeConnection(connection, `edges[${index}]`),
  );
}

function batchConnectionFailure(error, store) {
  const reason = error?.code || "unknown";
  const connection = error?.details?.connection ?? null;
  const missingNodeIds = connection
    ? [connection.source, connection.target].filter(
        (nodeId) => !store.nodes.some((node) => node.id === nodeId),
      )
    : [];
  let code = TOOL_ERROR_CODE.UNKNOWN;
  if (reason === "missingNode") code = TOOL_ERROR_CODE.NODE_NOT_FOUND;
  else if (reason === "invalidArguments") code = TOOL_ERROR_CODE.ARGS_INVALID;
  else if (["portMismatch", "duplicate", "cycle"].includes(reason)) {
    code = TOOL_ERROR_CODE.PORT_MISMATCH;
  }
  return createToolError(
    code,
    `Cannot apply edge at index ${error?.details?.index ?? "unknown"}: ${reason}. No connections were applied.`,
    {
      missing:
        missingNodeIds.length > 0
          ? { nodes: missingNodeIds }
          : { connection: [reason] },
      details: {
        atomic: true,
        applied: 0,
        reason,
        ...error?.details,
      },
      suggestion: {
        tool: "list_nodes",
        args: {},
        note: "Check node ids and compatible handles, then retry the whole edges list.",
      },
    },
  );
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const batch = normalizeConnectionBatch(args);

    if (batch) {
      requireBatchStoreAction(store, "batchConnectNodes");
      let addedEdges;
      try {
        addedEdges = await store.batchConnectNodes(batch);
      } catch (error) {
        throw batchConnectionFailure(error, context.getStore());
      }
      const downstreamNodeIds = [
        ...new Set(batch.map((connection) => connection.target)),
      ];
      return {
        success: true,
        batch: true,
        atomic: true,
        total: addedEdges.length,
        edges: addedEdges.map((edge) => ({
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        })),
        downstreamNodeIds,
        nodeStateChanges: [],
        recomputation: {
          triggered: false,
          trigger: "next_explicit_run",
        },
        history: { undoEntries: 1 },
      };
    }

    // Validate nodes exist.
    const nodes = store.nodes;
    if (!nodes.find((n) => n.id === args.sourceId)) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Source node not found: ${args.sourceId}`,
        {
          missing: { nodes: [args.sourceId] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Call list_nodes to get valid node ids, then retry.",
          },
        },
      );
    }
    if (!nodes.find((n) => n.id === args.targetId)) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Target node not found: ${args.targetId}`,
        {
          missing: { nodes: [args.targetId] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Call list_nodes to get valid node ids, then retry.",
          },
        },
      );
    }

    // Use the store's onConnect so port validation, history and save all run.
    const added = store.onConnect({
      source: args.sourceId,
      target: args.targetId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });
    if (!added) {
      throw createToolError(
        TOOL_ERROR_CODE.PORT_MISMATCH,
        `Cannot connect ${args.sourceId} (${args.sourceHandle}) → ${args.targetId} (${args.targetHandle}): the handle does not exist on one endpoint, or the edge is already present.`,
        {
          missing: { connection: ["matching source/target handles"] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Check each node's available output/input handles, then retry with ports that match.",
          },
        },
      );
    }

    return {
      edgeId: `edge-${args.sourceId}-${args.sourceHandle}-${args.targetId}-${args.targetHandle}`,
      source: args.sourceId,
      target: args.targetId,
    };
  },

  presentCall(args) {
    if (Array.isArray(args.edges)) {
      return {
        title: t("agent.tool.connectBatch.call", { count: args.edges.length }),
        icon: "link",
      };
    }
    return {
      title: `Connect ${(args.sourceId ?? "?").slice(0, 6)}… → ${(args.targetId ?? "?").slice(0, 6)}…`,
      icon: "link",
    };
  },

  presentResult(_args, result) {
    if (result?.batch) {
      return {
        title: t("agent.tool.connectBatch.result", { count: result.total }),
        status: "completed",
      };
    }
    return {
      title: `Connected (${(result?.edgeId ?? "?").slice(0, 12)}…)`,
      status: "completed",
    };
  },
});

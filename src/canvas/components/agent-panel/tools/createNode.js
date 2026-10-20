/**
 * Tool: create_node — Add a new node to the canvas.
 *
 * Maps to Codex's apply_patch pattern: structured mutation of the workspace.
 * In VOO, the "workspace" is the ReactFlow canvas.
 *
 * Only regular node types are offered: image/video generation goes through
 * the normal generate / videoShot nodes (executionMode "api" makes them use
 * direct API models), never the legacy apiImage / apiVideo node types.
 */

import {
  CREATE_NODE_TYPES,
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { hasOwnArgument, requireBatchStoreAction } from "./node-batch.js";
import { DEFAULT_NODE_POSITION } from "../../../node-position.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { t } from "../../../../shared/i18n.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import {
  adoptIntoAgentGroup,
  resolveAgentOutputGroup,
} from "./agent-output-group.js";
import {
  isImageGeneratorType,
  ensureGroupForImageGenerators,
} from "./group-generator-routing.js";

import { refreshConnectedPlatforms } from "../../../generation-target-state.js";
import { generationMediaType } from "../../../generation_target_defaults.js";

const def = getWorkflowToolDefinition("create_node");
const SINGLE_NODE_FIELDS = ["type", "position", "label", "data"];
const NODE_ITEM_FIELDS = ["ref", ...SINGLE_NODE_FIELDS];
const CONNECTION_FIELDS = [
  "sourceId",
  "targetId",
  "sourceHandle",
  "targetHandle",
];

function invalidCreateArguments(message, field) {
  return createToolError(TOOL_ERROR_CODE.ARGS_INVALID, message, {
    missing: field ? { args: [field] } : null,
    suggestion: {
      tool: null,
      args: {},
      note: "Use either one node or a non-empty nodes list, then retry the whole request.",
    },
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePosition(position, path) {
  if (
    !isRecord(position) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y)
  ) {
    throw invalidCreateArguments(
      `${path} must contain finite x and y coordinates.`,
      path,
    );
  }
}

function normalizeNodeItem(item, index) {
  const path = `nodes[${index}]`;
  if (!isRecord(item)) {
    throw invalidCreateArguments(`${path} must be a node object.`, path);
  }
  const extraFields = Object.keys(item).filter(
    (field) => !NODE_ITEM_FIELDS.includes(field),
  );
  if (extraFields.length > 0) {
    throw invalidCreateArguments(
      `${path} contains unsupported fields: ${extraFields.join(", ")}.`,
      path,
    );
  }
  if (typeof item.ref !== "string" || item.ref.trim() === "") {
    throw invalidCreateArguments(
      `${path}.ref must be a non-empty string.`,
      path,
    );
  }
  if (!CREATE_NODE_TYPES.includes(item.type)) {
    throw invalidCreateArguments(
      `${path}.type is not supported: ${item.type}.`,
      `${path}.type`,
    );
  }
  if (item.position !== undefined) {
    validatePosition(item.position, `${path}.position`);
  }
  if (item.data !== undefined && !isRecord(item.data)) {
    throw invalidCreateArguments(
      `${path}.data must be an object when provided.`,
      `${path}.data`,
    );
  }
  if (item.label !== undefined && typeof item.label !== "string") {
    throw invalidCreateArguments(
      `${path}.label must be a string when provided.`,
      `${path}.label`,
    );
  }
  return {
    ref: item.ref,
    type: item.type,
    ...(item.position ? { position: { ...item.position } } : {}),
    ...(item.label !== undefined ? { label: item.label } : {}),
    ...(item.data ? { data: { ...item.data } } : {}),
  };
}

function normalizeBatchEdge(edge, index) {
  const path = `edges[${index}]`;
  if (!isRecord(edge)) {
    throw invalidCreateArguments(`${path} must be an edge object.`, path);
  }
  const invalidFields = CONNECTION_FIELDS.filter(
    (field) => typeof edge[field] !== "string" || edge[field].trim() === "",
  );
  const extraFields = Object.keys(edge).filter(
    (field) => !CONNECTION_FIELDS.includes(field),
  );
  if (invalidFields.length > 0 || extraFields.length > 0) {
    throw invalidCreateArguments(
      `${path} must contain exactly sourceId, targetId, sourceHandle, and targetHandle as non-empty strings.`,
      path,
    );
  }
  return {
    source: edge.sourceId,
    target: edge.targetId,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  };
}

function normalizeNodeBatch(args) {
  if (!hasOwnArgument(args, "nodes")) {
    if (hasOwnArgument(args, "edges")) {
      throw invalidCreateArguments(
        "edges can only be used with nodes.",
        "nodes",
      );
    }
    return null;
  }
  const mixedFields = SINGLE_NODE_FIELDS.filter((field) =>
    hasOwnArgument(args, field),
  );
  if (mixedFields.length > 0) {
    throw invalidCreateArguments(
      `nodes cannot be combined with single-node fields: ${mixedFields.join(", ")}.`,
    );
  }
  if (!Array.isArray(args.nodes) || args.nodes.length === 0) {
    throw invalidCreateArguments("nodes must be a non-empty array.", "nodes");
  }
  const nodes = args.nodes.map(normalizeNodeItem);
  const duplicateRefs = nodes.filter(
    (node, index) => nodes.findIndex((item) => item.ref === node.ref) !== index,
  );
  if (duplicateRefs.length > 0) {
    throw invalidCreateArguments(
      `nodes contains duplicate refs: ${[...new Set(duplicateRefs.map((node) => node.ref))].join(", ")}.`,
      "nodes",
    );
  }
  let edges;
  if (hasOwnArgument(args, "edges")) {
    if (!Array.isArray(args.edges) || args.edges.length === 0) {
      throw invalidCreateArguments("edges must be a non-empty array.", "edges");
    }
    edges = args.edges.map(normalizeBatchEdge);
  }
  return { nodes, edges, inputEdges: args.edges ?? [] };
}

function batchCreationFailure(error, batch) {
  const reason = error?.code || "unknown";
  let code = TOOL_ERROR_CODE.UNKNOWN;
  if (
    [
      "invalidArguments",
      "invalidNodeType",
      "duplicateRef",
      "refConflict",
    ].includes(reason)
  ) {
    code = TOOL_ERROR_CODE.ARGS_INVALID;
  } else if (reason === "missingNode") {
    code = TOOL_ERROR_CODE.NODE_NOT_FOUND;
  } else if (["portMismatch", "duplicate", "cycle"].includes(reason)) {
    code = TOOL_ERROR_CODE.PORT_MISMATCH;
  }
  const index = error?.details?.index;
  return createToolError(
    code,
    `Cannot create the node batch: ${reason}. No nodes or edges were applied.`,
    {
      missing: { creation: [reason] },
      details: {
        atomic: true,
        created: 0,
        connected: 0,
        reason,
        ...error?.details,
        ...(Number.isInteger(index) && batch.inputEdges[index]
          ? { inputEdge: batch.inputEdges[index] }
          : {}),
      },
      suggestion: {
        tool: null,
        args: {},
        note: "Fix the referenced node, type, data, position, or edge and retry the whole request.",
      },
    },
  );
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const batch = normalizeNodeBatch(args);
    if (
      (batch?.nodes ?? [args]).some((item) => generationMediaType(item.type))
    ) {
      await refreshConnectedPlatforms();
    }
    const store = context.getStore();

    if (batch) {
      requireBatchStoreAction(store, "batchCreateNodes");
      let created;
      try {
        created = await store.batchCreateNodes(batch.nodes, batch.edges);
      } catch (error) {
        throw batchCreationFailure(error, batch);
      }

      const createdGenNodes = created.nodes.filter((n) =>
        isImageGeneratorType(n.type),
      );
      // Re-read the store: the batch may itself contain the Group these
      // generators belong to, and the snapshot taken before batchCreateNodes
      // cannot see it — which used to auto-create a second Group alongside it.
      const routedStore = context.getStore();
      if (
        createdGenNodes.length > 1 &&
        (typeof routedStore.addNode === "function" ||
          (Array.isArray(routedStore.nodes) &&
            routedStore.nodes.some((n) => n.type === NODE_TYPE.GROUP))) &&
        (typeof routedStore.batchConnectNodes === "function" ||
          typeof routedStore.onConnect === "function" ||
          Array.isArray(routedStore.edges))
      ) {
        ensureGroupForImageGenerators({
          store: routedStore,
          generatorNodes: createdGenNodes,
          relatedNodeIds: created.edges?.map((e) => e.source) ?? [],
          // Inside a bound Agent Gen session the artifacts are adopted into the
          // node's output Group below; wire them to that same Group so they do
          // not end up split across two.
          preferredGroupId: resolveAgentOutputGroup(
            routedStore,
            context.agentNodeId,
          ),
        });
      }

      // A bound Agent Gen session collects its artifacts: adopt what this call
      // created into the node's output Group. Re-read the store so the Group
      // (which may have been created in this same call) is visible.
      const adoptedIds = adoptIntoAgentGroup(
        context.getStore(),
        context.agentNodeId,
        created.nodes.map((node) => node.id),
      );

      return {
        success: true,
        batch: true,
        atomic: true,
        total: created.nodes.length,
        nodeIds: created.nodes.map((node) => node.id),
        ...(adoptedIds.length > 0 ? { adoptedIntoGroup: adoptedIds } : {}),
        nodes: batch.nodes.map((item, index) => ({
          ref: item.ref,
          nodeId: created.nodes[index].id,
          type: created.nodes[index].type,
          position: created.nodes[index].position,
        })),
        edges: created.edges.map((edge) => ({
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        })),
        history: { undoEntries: 1 },
      };
    }

    if (!CREATE_NODE_TYPES.includes(args.type)) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Unknown node type: ${args.type}`,
        {
          missing: { args: ["type"] },
          suggestion: {
            tool: null,
            args: {},
            note: `Pick one of the supported node types: ${CREATE_NODE_TYPES.join(", ")}.`,
          },
        },
      );
    }
    if (args.data !== undefined && !isRecord(args.data)) {
      throw invalidCreateArguments(
        "data must be an object when provided.",
        "data",
      );
    }
    const position = args.position || { ...DEFAULT_NODE_POSITION };

    const existing = getExistingIdempotentRecord(context);
    let nodeId = null;
    let createdFresh = false;
    if (
      existing?.nodeId &&
      store.nodes?.some((n) => n.id === existing.nodeId)
    ) {
      nodeId = existing.nodeId;
      if (args.data && isRecord(args.data)) {
        store.updateNodeData(nodeId, { ...args.data });
      }
    } else {
      nodeId = args.data
        ? store.addNode(args.type, position, { ...args.data })
        : store.addNode(args.type, position);
      createdFresh = true;
    }

    if (args.label) {
      store.updateNodeData(nodeId, { label: args.label });
    }

    // A bound Agent Gen session collects its artifacts into the node's Group.
    const adoptedIntoGroup = createdFresh
      ? adoptIntoAgentGroup(context.getStore(), context.agentNodeId, [nodeId])
      : [];

    return {
      nodeId,
      type: args.type,
      position,
      // Only present when the session was bound: keeps the unbound result
      // shape (and its existing contract tests) unchanged.
      ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
    };
  },

  presentCall(args) {
    if (Array.isArray(args.nodes)) {
      return {
        title: t("agent.tool.createBatch.call", { count: args.nodes.length }),
        icon: "plus-circle",
      };
    }
    return { title: `Create ${args.type} node`, icon: "plus-circle" };
  },

  presentResult(args, result) {
    if (result?.batch) {
      return {
        title: t("agent.tool.createBatch.result", { count: result.total }),
        status: "completed",
      };
    }
    return {
      title: `Created ${result.type} node (${result.nodeId.slice(0, 8)}…)`,
      status: "completed",
    };
  },
});

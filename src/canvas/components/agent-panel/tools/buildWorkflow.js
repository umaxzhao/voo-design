/**
 * Tool: build_workflow — Atomically create, connect, and optionally run an entire
 * workflow graph in one agent call.
 *
 * Implements single-ChangeSet and single-undo transactional graph construction
 * with pre-mutation topological validation, non-overlapping layered auto-placement,
 * and optional execution delegation to the workflow runner.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { validateWorkflowSpec } from "./workflow-graph-spec.js";
import { requireBatchStoreAction } from "./node-batch.js";
import { layoutWorkflowNodes } from "../../../workflow_layout.js";
import {
  getNodeVisualSize,
  DEFAULT_NODE_POSITION,
} from "../../../node-position.js";
import runWorkflowTool from "./runWorkflow.js";
import { t } from "../../../../shared/i18n.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import {
  isImageGeneratorType,
  ensureGroupForImageGenerators,
} from "./group-generator-routing.js";

const def = getWorkflowToolDefinition("build_workflow");

/**
 * Computes non-overlapping positions for unpositioned nodes in a layered left-to-right layout.
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @param {Array} existingNodes
 * @param {Object|null} attachTo
 * @returns {Array}
 */
export function computeWorkflowLayout(
  nodes,
  edges,
  existingNodes = [],
  attachTo = null,
) {
  const unpositioned = nodes.filter((n) => !n.position);
  if (unpositioned.length === 0) {
    return nodes;
  }

  const COLUMN_GAP = 130;
  let anchorX = DEFAULT_NODE_POSITION.x;
  let anchorY = DEFAULT_NODE_POSITION.y;

  if (existingNodes.length > 0) {
    const maxExistingRight = Math.max(
      ...existingNodes.map((n) => n.position.x + getNodeVisualSize(n).width),
    );
    anchorX = maxExistingRight + COLUMN_GAP;
    if (attachTo?.nodeId) {
      const attachedNode = existingNodes.find((n) => n.id === attachTo.nodeId);
      anchorY = attachedNode
        ? attachedNode.position.y
        : Math.min(...existingNodes.map((n) => n.position.y));
    } else {
      let sourceNodeForAnchor = null;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          const fromRef = typeof edge.source === "string" ? edge.source : null;
          const found = existingNodes.find((n) => n.id === fromRef);
          if (found) {
            sourceNodeForAnchor = found;
            break;
          }
        }
      }
      anchorY = sourceNodeForAnchor
        ? sourceNodeForAnchor.position.y
        : Math.min(...existingNodes.map((n) => n.position.y));
    }
  }

  // Create temporary nodes for layout calculation
  const tempNodes = nodes.map((node) => ({
    id: node.ref,
    type: node.type,
    position: node.position ? { ...node.position } : { x: anchorX, y: anchorY },
    data: node.data || {},
  }));

  const tempEdges = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const laidOut = layoutWorkflowNodes(tempNodes, tempEdges);

  // Offset unpositioned nodes so their leftmost boundary sits at anchorX
  const unpositionedLaidOut = laidOut.filter(
    (n) => !nodes.find((orig) => orig.ref === n.id)?.position,
  );

  if (unpositionedLaidOut.length > 0) {
    const minX = Math.min(...unpositionedLaidOut.map((n) => n.position.x));
    const minY = Math.min(...unpositionedLaidOut.map((n) => n.position.y));
    const offsetX = anchorX - minX;
    const offsetY = anchorY - minY;

    const positionsByRef = new Map();
    laidOut.forEach((n) => {
      const orig = nodes.find((o) => o.ref === n.id);
      if (orig?.position) {
        positionsByRef.set(n.id, orig.position);
      } else {
        positionsByRef.set(n.id, {
          x: Math.round(n.position.x + offsetX),
          y: Math.round(n.position.y + offsetY),
        });
      }
    });

    return nodes.map((node) => ({
      ...node,
      position: positionsByRef.get(node.ref) || node.position,
    }));
  }

  return nodes;
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();
    const existingNodes = store.nodes || [];
    const existingEdges = store.edges || [];

    // Check for canvas deduplication via idempotent record
    const existing = getExistingIdempotentRecord(context);
    if (
      existing?.changeSet?.result?.nodeIds &&
      Array.isArray(existing.changeSet.result.nodeIds)
    ) {
      const allExist = existing.changeSet.result.nodeIds.every((id) =>
        existingNodes.some((n) => n.id === id),
      );
      if (allExist) {
        return existing.changeSet.result;
      }
    }

    // 1. Validate everything BEFORE mutating anything
    const validation = validateWorkflowSpec(args, existingNodes, existingEdges);
    const { normalizedNodes, resolvedEdges } = validation;

    requireBatchStoreAction(store, "batchCreateNodes");

    // 2. Compute non-overlapping layout for unpositioned nodes
    const positionedNodes = computeWorkflowLayout(
      normalizedNodes,
      resolvedEdges,
      existingNodes,
      args.attachTo || null,
    );

    // 3. Apply atomically to store (exactly one undo entry). Capture the
    // history transaction the build pushes so the ChangeSet can link to the
    // one reversible undo unit it created (plan-agent-workflow-next §3).
    // Zustand state is immutable per set(), so the post-mutation depth is
    // re-read from a fresh getStore(); stores without an undo stack degrade
    // to a null link.
    const undoSupported = Array.isArray(store.undoStack);
    const undoDepthBefore = undoSupported ? store.undoStack.length : null;
    const created = await store.batchCreateNodes(
      positionedNodes,
      resolvedEdges,
    );
    const afterStore =
      typeof context.getStore === "function" ? context.getStore() : store;
    const undoDepthAfter =
      undoSupported && Array.isArray(afterStore?.undoStack)
        ? afterStore.undoStack.length
        : null;
    const historyTransaction =
      undoSupported && undoDepthAfter !== null
        ? {
            actionId: "workflow.graph.batchCreate",
            entryIndex: undoDepthAfter - 1,
            undoDepthBefore,
            undoDepthAfter,
            entryCount: undoDepthAfter - undoDepthBefore,
          }
        : null;

    const refToId = Object.fromEntries(
      positionedNodes.map((item, index) => [item.ref, created.nodes[index].id]),
    );
    const nodeIds = created.nodes.map((node) => node.id);
    const edgeIds = created.edges.map((edge) => edge.id);

    const createdGenNodes = created.nodes.filter((n) =>
      isImageGeneratorType(n.type),
    );
    // Re-read the store so a groupNode this same batch created is visible;
    // routing against the pre-creation snapshot used to add a second Group.
    const routedStore =
      typeof context.getStore === "function" ? context.getStore() : store;
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
      });
    }

    // 4. If requested, run the created nodes via runWorkflow's execution path
    let runReceipt = null;
    if (args.run) {
      runReceipt = await runWorkflowTool.execute({ nodeIds }, context);
    }

    return {
      refToId,
      nodeIds,
      edgeIds,
      historyTransaction,
      ...(runReceipt ? { run: runReceipt, receipt: runReceipt } : {}),
    };
  },

  presentCall(args) {
    const count = Array.isArray(args?.nodes) ? args.nodes.length : 0;
    return {
      title: t("agent.tool.buildWorkflow.call", { count }),
      icon: "workflow",
    };
  },

  presentResult(args, result) {
    const count = Array.isArray(result?.nodeIds) ? result.nodeIds.length : 0;
    const edges = Array.isArray(result?.edgeIds) ? result.edgeIds.length : 0;
    return {
      title: t("agent.tool.buildWorkflow.result", { count, edges }),
      status: "completed",
    };
  },
});

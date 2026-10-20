/**
 * Tool: generate_3d_model — Create a 3D model generation node on the canvas.
 *
 * Routes 3D generation via MODEL_ROUTE_ID.MODEL_3D_GENERATION (302.AI / Tripo Web),
 * and routes results to the bound agent output Group.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { HANDLE, NODE_TYPE } from "../../../nodes/node_enums.js";
import {
  generationDataPatch,
  generationRouteReceipt,
} from "./generation-route.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import { refreshConnectedPlatforms } from "../../../generation-target-state.js";
import {
  MEDIA_KIND,
  editorPlacementReceipt,
  generationPosition,
  placeGenerationInOpenEditor,
} from "./editor-place.js";
import {
  getDefaultModelRoute,
  MODEL_ROUTE_ID,
} from "../../../../shared/model-routes.js";

const def = getWorkflowToolDefinition("generate_3d_model");

/** Canvas position for a new node when the caller names none. */
const DEFAULT_POSITION = Object.freeze({ x: 600, y: 200 });

function resolveAgentOutputGroup(store, agentNodeId) {
  if (!agentNodeId) return null;
  const agent = store.nodes?.find(
    (node) => node.id === agentNodeId && node.type === NODE_TYPE.AGENT,
  );
  const groupId = agent?.data?.outputGroupId;
  if (!groupId) return null;
  const group = store.nodes?.find(
    (node) => node.id === groupId && node.type === NODE_TYPE.GROUP,
  );
  return group ? group.id : null;
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    await refreshConnectedPlatforms();
    const store = context.getStore();
    const position = generationPosition(store, args.position, DEFAULT_POSITION);

    // Check existing record by idempotencyKey
    const existing = getExistingIdempotentRecord(context);

    if (existing?.taskId) {
      const fetchFn =
        context.fetchProviderJob ||
        context.fetchTaskStatus ||
        context.providerClient?.fetchProviderJob;
      let taskStatus = null;
      if (typeof fetchFn === "function") {
        taskStatus = await fetchFn({
          mediaType: "model3d",
          taskId: existing.taskId,
          providerId: args.platform
            ? undefined
            : existing.changeSet?.result?.providerId,
        });
      }
      return {
        nodeId: existing.nodeId,
        taskId: existing.taskId,
        type: NODE_TYPE.API_3D,
        reconciled: true,
        fetched: true,
        status: taskStatus?.status || "pending",
        taskStatus,
        ...(taskStatus && typeof taskStatus === "object" ? taskStatus : {}),
      };
    }

    let nodeId = null;
    if (
      existing?.nodeId &&
      store.nodes?.some((n) => n.id === existing.nodeId)
    ) {
      nodeId = existing.nodeId;
    } else {
      nodeId = store.addNode(NODE_TYPE.API_3D, position);
    }

    const dataPatch = generationDataPatch(args);
    if (args.providerId) dataPatch.providerId = args.providerId;
    if (args.modelId) dataPatch.modelId = args.modelId;

    if (!dataPatch.providerId) {
      const defaultRoute = getDefaultModelRoute(
        MODEL_ROUTE_ID.MODEL_3D_GENERATION,
      );
      if (defaultRoute?.providerId) {
        dataPatch.providerId = defaultRoute.providerId;
        if (defaultRoute.modelId) dataPatch.modelId = defaultRoute.modelId;
      }
    }

    store.updateNodeData(nodeId, dataPatch);

    let taskId = undefined;
    const submitFn = context.submitProviderJob || context.submitTask;
    if (args.submit && typeof submitFn === "function") {
      const submitted = await submitFn({
        nodeId,
        prompt: args.prompt,
        mediaType: "model3d",
        args,
      });
      taskId = submitted?.taskId;
      if (taskId) {
        const runId = context.runId || context.executionContext?.agentRunId;
        const csId =
          context.changeSetId || context.executionContext?.changeSetId;
        if (context.runStore && runId && csId) {
          context.runStore.updateChangeSet(runId, csId, { taskId, nodeId });
        }
      }
    }

    // Auto-connect image input (reference image)
    let connectedImage = false;
    if (args.connectFromImage) {
      connectedImage =
        store.onConnect({
          source: args.connectFromImage,
          target: nodeId,
          sourceHandle: "image",
          targetHandle: "image",
        }) === true;
    }

    // Auto-connect text input
    let connectedText = false;
    if (args.connectFromText) {
      connectedText =
        store.onConnect({
          source: args.connectFromText,
          target: nodeId,
          sourceHandle: "text",
          targetHandle: "text",
        }) === true;
    }

    // Route 3D output to bound Agent Gen output group, or an existing Group
    const agentNodeId =
      context.agentNodeId ||
      context.executionContext?.agentNodeId ||
      args.agentNodeId;
    const outputGroupId =
      resolveAgentOutputGroup(store, agentNodeId) ||
      store.nodes?.find((n) => n.type === NODE_TYPE.GROUP)?.id ||
      null;

    let connectedGroup = false;
    if (outputGroupId) {
      connectedGroup =
        store.onConnect({
          source: nodeId,
          target: outputGroupId,
          sourceHandle: HANDLE.MODEL_3D,
          targetHandle: HANDLE.MEDIA,
        }) === true;
    }

    const placement = placeGenerationInOpenEditor(
      store,
      nodeId,
      MEDIA_KIND.MODEL_3D,
    );
    const editorPlacement = editorPlacementReceipt(placement);

    return {
      nodeId,
      ...(taskId ? { taskId } : {}),
      type: NODE_TYPE.API_3D,
      prompt: args.prompt,
      ...generationRouteReceipt(context, nodeId),
      connectedImage,
      connectedText,
      ...(outputGroupId ? { groupId: outputGroupId, connectedGroup } : {}),
      ...(editorPlacement ? { editorPlacement } : {}),
    };
  },

  presentCall(args) {
    const prompt = args.prompt ?? "";
    const preview = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    return { title: `Generate 3D: "${preview}"`, icon: "box" };
  },

  presentResult(_args, result) {
    return {
      title: `3D model node created (${(result?.nodeId ?? "?").slice(0, 8)}…)`,
      status: "completed",
    };
  },
});

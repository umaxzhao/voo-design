/**
 * Tool: generate_video — Create a video generation node on the canvas.
 *
 * Prefers connected Jimeng unless the caller explicitly selects a route.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import {
  generationDataPatch,
  generationRouteReceipt,
} from "./generation-route.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import { adoptIntoAgentGroup } from "./agent-output-group.js";
import { refreshConnectedPlatforms } from "../../../generation-target-state.js";
import {
  MEDIA_KIND,
  editorPlacementReceipt,
  generationPosition,
  placeGenerationInOpenEditor,
} from "./editor-place.js";
import { t } from "../../../../shared/i18n.js";

const def = getWorkflowToolDefinition("generate_video");

/** Canvas position for a new node when the caller names none. */
const DEFAULT_POSITION = Object.freeze({ x: 600, y: 200 });

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    await refreshConnectedPlatforms();
    const store = context.getStore();
    // Keep the backing generation node beside its target canvas.
    const position = generationPosition(store, args.position, DEFAULT_POSITION);

    // Check existing record by idempotencyKey
    const existing = getExistingIdempotentRecord(context);

    // 3. 远端对账：已有 taskId 时改为 fetch 这个 task 的状态，不再重新提交
    if (existing?.taskId) {
      const fetchFn =
        context.fetchProviderJob ||
        context.fetchTaskStatus ||
        context.providerClient?.fetchProviderJob;
      let taskStatus = null;
      if (typeof fetchFn === "function") {
        taskStatus = await fetchFn({
          mediaType: "video",
          taskId: existing.taskId,
          providerId: args.platform
            ? undefined
            : existing.changeSet?.result?.providerId,
        });
      }
      return {
        nodeId: existing.nodeId,
        taskId: existing.taskId,
        type: NODE_TYPE.VIDEO,
        reconciled: true,
        fetched: true,
        status: taskStatus?.status || "pending",
        taskStatus,
        ...(taskStatus && typeof taskStatus === "object" ? taskStatus : {}),
      };
    }

    // 4. 画布去重：同一个 idempotencyKey 第二次执行时，不能再建一个新节点，要复用第一次建的节点 id
    let nodeId = null;
    let createdFresh = false;
    if (
      existing?.nodeId &&
      store.nodes?.some((n) => n.id === existing.nodeId)
    ) {
      nodeId = existing.nodeId;
    } else {
      nodeId = store.addNode(NODE_TYPE.VIDEO, position);
      createdFresh = true;
    }

    const adoptedIntoGroup = createdFresh
      ? adoptIntoAgentGroup(context.getStore(), context.agentNodeId, [nodeId])
      : [];

    store.updateNodeData(nodeId, generationDataPatch(args));

    let taskId = undefined;
    const submitFn = context.submitProviderJob || context.submitTask;
    if (args.submit && typeof submitFn === "function") {
      const submitted = await submitFn({
        nodeId,
        prompt: args.prompt,
        mediaType: "video",
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

    // Auto-connect image input (store.onConnect validates ports + saves).
    // Report the actual outcomes — a rejected connection leaves the node
    // intact but the edge absent, and the model should hear about it.
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

    // Auto-connect text input.
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

    // Video lands in the canvas after run_workflow and insert_media; a source
    // node alone is not an inserted scene layer.
    const placement = placeGenerationInOpenEditor(
      store,
      nodeId,
      MEDIA_KIND.VIDEO,
    );
    const editorPlacement = editorPlacementReceipt(placement);

    return {
      nodeId,
      ...(taskId ? { taskId } : {}),
      type: NODE_TYPE.VIDEO,
      prompt: args.prompt,
      ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
      ...generationRouteReceipt(context, nodeId),
      connectedImage,
      connectedText,
      ...(editorPlacement ? { editorPlacement } : {}),
    };
  },

  presentCall(args) {
    const prompt = args.prompt ?? "";
    const preview = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    return { title: `Generate video: "${preview}"`, icon: "video" };
  },

  presentResult(_args, result) {
    // A video wired into the open timeline is already a clip in it, so the card
    // names the timeline rather than a canvas node the user is not looking at.
    if (result?.editorPlacement?.placed) {
      return {
        title: t("agent.tool.generateVideo.inTimeline"),
        status: "completed",
      };
    }
    return {
      title: `Video node created (${(result?.nodeId ?? "?").slice(0, 8)}…)`,
      status: "completed",
    };
  },
});

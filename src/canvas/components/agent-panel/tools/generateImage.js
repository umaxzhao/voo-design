/**
 * Tool: generate_image — Create an image generation node on the canvas.
 *
 * Prefers connected websites unless the caller explicitly selects a route.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { HANDLE, NODE_TYPE, nodeHasPort } from "../../../nodes/node_enums.js";
import {
  generationDataPatch,
  generationRouteReceipt,
} from "./generation-route.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import { buildStyleAnchor, applyStyleAnchorToPrompt } from "../style-seed.js";
import { refreshConnectedPlatforms } from "../../../generation-target-state.js";
import { ensureGroupForImageGenerators } from "./group-generator-routing.js";
import { adoptIntoAgentGroup } from "./agent-output-group.js";
import {
  MEDIA_KIND,
  editorPlacementReceipt,
  generationPosition,
  placeGenerationInOpenEditor,
} from "./editor-place.js";
import { t } from "../../../../shared/i18n.js";

const def = getWorkflowToolDefinition("generate_image");

/** Canvas position for a new node when the caller names none. */
const DEFAULT_POSITION = Object.freeze({ x: 400, y: 200 });

/** Both single and batch nodes must retain the user's reference-image wire. */
function connectSource(store, sourceId, nodeId) {
  if (!sourceId) return false;
  const sourceNode = store.nodes.find((node) => node.id === sourceId);
  if (!sourceNode) return false;
  const handle = nodeHasPort(sourceNode, "source", HANDLE.IMAGE)
    ? HANDLE.IMAGE
    : HANDLE.TEXT;
  return (
    store.onConnect({
      source: sourceId,
      target: nodeId,
      sourceHandle: handle,
      targetHandle: handle,
    }) === true
  );
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    await refreshConnectedPlatforms();
    const store = context.getStore();
    // With a document open in the design editor the node lands beside it, and
    // gets wired into it below, so the result arrives as a layer in the
    // document the user is working in rather than next to it.
    const position = generationPosition(store, args.position, DEFAULT_POSITION);

    // Batch path: generate multiple images across prompts
    if (Array.isArray(args.prompts) && args.prompts.length > 0) {
      // Guard: if the same tool call was already executed (same idempotency
      // key), return the previously created nodes instead of duplicating them.
      // The single-node path already does this; the batch path was missing it.
      const batchExisting = getExistingIdempotentRecord(context);
      if (batchExisting?.nodeId) {
        const existingNodes = (
          batchExisting.changeSet?.result?.nodeIds ?? [batchExisting.nodeId]
        ).filter((id) => store.nodes?.some((n) => n.id === id));
        if (existingNodes.length > 0) {
          return {
            batch: true,
            count: existingNodes.length,
            nodeIds: existingNodes,
            type: NODE_TYPE.GENERATE,
            reconciled: true,
          };
        }
      }

      const brief =
        args.projectBrief ||
        context?.projectBrief ||
        context?.brief ||
        (typeof context?.getBrief === "function" ? context.getBrief() : null) ||
        (typeof context?.getCanvasState === "function"
          ? context.getCanvasState()?.projectBrief
          : null) ||
        store?.projectBrief ||
        null;

      const styleAnchor = args.consistent
        ? await buildStyleAnchor({
            prompt: args.prompts[0],
            brief,
            style: args.style,
            extractor: args.styleExtractor || context?.styleExtractor,
          })
        : null;

      const nodeIds = [];
      const connections = [];
      const startX = position.x;
      const startY = position.y;
      for (let i = 0; i < args.prompts.length; i += 1) {
        const itemPrompt = args.prompts[i];
        const effectivePrompt =
          args.consistent && styleAnchor && i > 0
            ? applyStyleAnchorToPrompt(itemPrompt, styleAnchor, i + 1, 1)
            : itemPrompt;

        const pos = { x: startX + i * 280, y: startY };
        const nodeId = store.addNode(NODE_TYPE.GENERATE, pos);
        const itemArgs = { ...args, prompt: effectivePrompt };
        delete itemArgs.prompts;
        const patch = generationDataPatch(itemArgs);
        if (styleAnchor) patch.styleAnchor = styleAnchor;
        store.updateNodeData(nodeId, patch);
        nodeIds.push(nodeId);
        connections.push({
          nodeId,
          connected: connectSource(store, args.connectFrom, nodeId),
        });
      }

      const adoptedIntoGroup = adoptIntoAgentGroup(
        typeof context.getStore === "function" ? context.getStore() : store,
        context.agentNodeId,
        nodeIds,
      );

      let groupRouting = null;
      if (nodeIds.length > 1 && adoptedIntoGroup.length === 0) {
        // Re-read the store: `store` was captured before the loop above created
        // these nodes, so it sees neither them nor any Group they already feed.
        const routedStore =
          typeof context.getStore === "function" ? context.getStore() : store;
        const genNodes = (routedStore.nodes || []).filter((n) =>
          nodeIds.includes(n.id),
        );
        const fallbackNodes = nodeIds.map((id, index) => ({
          id,
          type: NODE_TYPE.GENERATE,
          position: { x: startX + index * 280, y: startY },
        }));
        groupRouting = ensureGroupForImageGenerators({
          store: routedStore,
          generatorNodes: genNodes.length > 0 ? genNodes : fallbackNodes,
          relatedNodeIds: args.connectFrom ? [args.connectFrom] : [],
        });
      }

      return {
        batch: true,
        count: nodeIds.length,
        nodeIds,
        connections,
        type: NODE_TYPE.GENERATE,
        prompts: args.prompts,
        ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
        ...(groupRouting?.groupId ? { groupId: groupRouting.groupId } : {}),
        ...(styleAnchor ? { styleAnchor, anchor: styleAnchor } : {}),
      };
    }

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
          mediaType: "image",
          taskId: existing.taskId,
          providerId: args.platform
            ? undefined
            : existing.changeSet?.result?.providerId,
        });
      }
      return {
        nodeId: existing.nodeId,
        taskId: existing.taskId,
        type: NODE_TYPE.GENERATE,
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
      nodeId = store.addNode(NODE_TYPE.GENERATE, position);
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
        mediaType: "image",
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

    // Auto-connect if requested (store.onConnect validates ports + saves).
    // Report the actual outcome: a rejected connection is not a failure of
    // node creation — the node exists, the edge just did not land.
    const connected = connectSource(store, args.connectFrom, nodeId);

    // An image generated while a document is open belongs in that document, as
    // a new layer. The ingestion path already appends a finished result to a
    // connected imageAsset node's `editorDoc`; this is the missing wire. With
    // no editor open nothing is connected and the node stays a canvas node.
    const placement =
      args.mountInOpenEditor === false
        ? null
        : placeGenerationInOpenEditor(store, nodeId, MEDIA_KIND.IMAGE);
    const editorPlacement = editorPlacementReceipt(placement);

    let styleAnchor = null;
    if (args.consistent) {
      const brief =
        args.projectBrief ||
        context?.projectBrief ||
        context?.brief ||
        (typeof context?.getBrief === "function" ? context.getBrief() : null) ||
        (typeof context?.getCanvasState === "function"
          ? context.getCanvasState()?.projectBrief
          : null) ||
        store?.projectBrief ||
        null;

      styleAnchor = await buildStyleAnchor({
        prompt: args.prompt,
        brief,
        style: args.style,
        extractor: args.styleExtractor || context?.styleExtractor,
      });
      if (styleAnchor) {
        store.updateNodeData(nodeId, { styleAnchor });
      }
    }

    return {
      nodeId,
      ...(taskId ? { taskId } : {}),
      type: NODE_TYPE.GENERATE,
      prompt: args.prompt,
      ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
      ...generationRouteReceipt(context, nodeId),
      connected,
      ...(styleAnchor ? { styleAnchor, anchor: styleAnchor } : {}),
      ...(editorPlacement ? { editorPlacement } : {}),
    };
  },

  presentCall(args) {
    const prompt = args.prompt ?? "";
    const preview = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    return { title: `Generate image: "${preview}"`, icon: "image" };
  },

  presentResult(_args, result) {
    // When the result goes into a document the user has open, the card says so:
    // "node created" would describe a canvas node that is not what they will
    // see, the new layer is.
    if (result?.editorPlacement?.placed) {
      return {
        title: t("agent.tool.generateImage.inDocument"),
        status: "completed",
      };
    }
    return {
      title: `Image node created (${(result?.nodeId ?? "?").slice(0, 8)}…)`,
      status: "completed",
    };
  },
});

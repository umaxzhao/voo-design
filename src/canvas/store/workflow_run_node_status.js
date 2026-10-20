/**
 * Node-status hydration + background persistence seam.
 *
 * updateBackgroundWorkflowNode persists a node patch to a background (off-canvas)
 * workflow store; createRunNodeStatusHandler builds the onNodeStatus callback
 * that turns a node status patch into state, image/gallery hydration, and a
 * scheduleSave — the single write path every node result flows through.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_run_node_status
 */

import { RUN_STATUS } from "../nodes/types.js";
import { dataUrlToBlob, loadWorkflow, saveWorkflow } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { scheduleSave } from "./persistence.js";
import { createInputSignatureReader } from "../engine/workflow-input-signature.js";

async function updateBackgroundWorkflowNode(workflowId, nodeId, patch) {
  try {
    const stored = await loadWorkflow(workflowId);
    if (!stored || !Array.isArray(stored.nodes)) return;
    const receivedNodePatch = { ...patch };
    delete receivedNodePatch.imageEntries;
    delete receivedNodePatch.galleryResults;
    let nodePatch = receivedNodePatch;
    if (nodePatch.status === RUN_STATUS.PENDING) {
      const pendingPatch = { ...nodePatch };
      delete pendingPatch.results;
      delete pendingPatch.selectedIndex;
      nodePatch = pendingPatch;
    }
    const nodes = stored.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          ...nodePatch,
        },
      };
    });
    await saveWorkflow({
      ...stored,
      nodes,
    });
  } catch {
    // Best-effort background workflow persistence
  }
}

/**
 * Builds the onNodeStatus callback shared by performRun. Closes over the
 * execution record, the target workflow id, and the async-final-commit handle.
 */
export function createRunNodeStatusHandler({
  get,
  set,
  execution,
  targetWorkflowId,
  finalCommit,
  initialNodes,
  initialEdges,
}) {
  const runningInputs = new Map();
  let shadowNodes = initialNodes;
  let shadowEdges = initialEdges;
  return (nodeId, patch) => {
    void execution.recordNodePatch(nodeId, patch);
    const isBackground = get().workflowId !== targetWorkflowId;
    if (patch.status === RUN_STATUS.RUNNING) {
      const nodes = isBackground ? shadowNodes : get().nodes;
      const edges = isBackground ? shadowEdges : get().edges;
      runningInputs.set(
        nodeId,
        createInputSignatureReader(nodes, edges)(nodeId),
      );
    }
    if (isBackground) {
      const backgroundPatch =
        patch.status === RUN_STATUS.SUCCESS
          ? {
              ...patch,
              inputSignature:
                runningInputs.get(nodeId) ??
                createInputSignatureReader(shadowNodes, shadowEdges)(nodeId),
            }
          : patch;
      if (patch.status === RUN_STATUS.SUCCESS) runningInputs.delete(nodeId);
      const shadowPatch = { ...backgroundPatch };
      delete shadowPatch.imageEntries;
      delete shadowPatch.galleryResults;
      if (shadowPatch.status === RUN_STATUS.PENDING) {
        delete shadowPatch.results;
        delete shadowPatch.selectedIndex;
      }
      shadowNodes = shadowNodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...shadowPatch } }
          : node,
      );
      void updateBackgroundWorkflowNode(
        targetWorkflowId,
        nodeId,
        backgroundPatch,
      );
      return;
    }
    const { imageEntries, galleryResults, ...receivedNodePatch } = patch;
    let nodePatch = receivedNodePatch;
    const currentNode = get().nodes.find((node) => node.id === nodeId);
    if (nodePatch.status === RUN_STATUS.PENDING) {
      // Pending is operational state only. Keep the last stable result visible
      // and available to the success snapshot so one undo restores the rerun.
      const pendingPatch = { ...nodePatch };
      delete pendingPatch.results;
      delete pendingPatch.selectedIndex;
      nodePatch = pendingPatch;
    }
    if (nodePatch.status === RUN_STATUS.SUCCESS && currentNode) {
      nodePatch = {
        ...nodePatch,
        inputSignature:
          runningInputs.get(nodeId) ??
          createInputSignatureReader(get().nodes, get().edges)(nodeId),
      };
      runningInputs.delete(nodeId);
      finalCommit.commit();
    }
    // The run banner tracks which node is executing right now; the node's
    // own stage patch then supplies the step text.
    if (nodePatch.status === RUN_STATUS.RUNNING) {
      set({ run: { ...get().run, activeNodeId: nodeId } });
    }
    if (imageEntries && imageEntries.length > 0) {
      const blobMap = new Map();
      for (const [id, source] of imageEntries) {
        const blob =
          typeof source === "string" ? dataUrlToBlob(source) : source;
        blobMap.set(id, blob);
      }
      set({ images: mergeBlobsAsUrls(get().images, blobMap) });
    }
    // imageEntries are an in-memory hydration aid. Results are persisted as
    // blob ids only, so workflows never store full data URLs in their graph.
    get().updateNodeData(nodeId, nodePatch);
    shadowNodes = get().nodes;
    shadowEdges = get().edges;
    void execution.recordNodePatch(nodeId, nodePatch);
    if (nodePatch.results) {
      get().hydrateImages(nodePatch.results);
      // Thumbnails for the fresh batch land in the same read pass (4.3).
      void get().hydrateThumbnails?.(nodePatch.results);
    }
    if (
      nodePatch.status === RUN_STATUS.SUCCESS &&
      Array.isArray(nodePatch.results) &&
      nodePatch.results.length > 0
    ) {
      get().appendResultsToGalleries(
        nodeId,
        Array.isArray(galleryResults) ? galleryResults : nodePatch.results,
      );
    }
    if (
      nodePatch.status === RUN_STATUS.SUCCESS ||
      nodePatch.status === RUN_STATUS.ERROR ||
      nodePatch.status === RUN_STATUS.SKIPPED ||
      nodePatch.remoteJob?.taskId
    ) {
      void scheduleSave(get, { immediate: true });
    }
  };
}

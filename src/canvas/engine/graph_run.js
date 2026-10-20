import { EXECUTION_MODE, NODE_TYPE, RUN_STATUS } from "../nodes/types.js";
import { topoSort } from "./graph_connections.js";

function indexNodes(nodes) {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** Node types a run actually executes. */
const RUNNABLE_TYPES = new Set([
  NODE_TYPE.GENERATE,
  NODE_TYPE.VIDEO,
  NODE_TYPE.API_IMAGE,
  NODE_TYPE.API_VIDEO,
  NODE_TYPE.API_AUDIO,
  NODE_TYPE.API_3D,
  NODE_TYPE.PROMPT,
  NODE_TYPE.AGENT,
  NODE_TYPE.STORYBOARD,
]);

/**
 * Whether a node executes during a run.
 *
 * A PROMPT node only runs when it carries an AI instruction (`aiPrompt`) — a
 * plain text node is a context source, not a task. An AGENT node only runs when
 * it has a standing brief, and is skipped while already RUNNING so the turn it
 * starts cannot re-enter the node that is running it. Everything else in
 * RUNNABLE_TYPES always runs.
 */
export function isRunnableNode(node) {
  if (!node || !RUNNABLE_TYPES.has(node.type)) return false;
  // Output copies own previews, not a new billable generation request.
  if (
    [NODE_TYPE.API_AUDIO, NODE_TYPE.API_3D].includes(node.type) &&
    node.data?.origin === "generated" &&
    node.data?.sourceNodeId &&
    !node.data?.prompt?.trim()
  )
    return false;
  if (node.type === NODE_TYPE.PROMPT) {
    return Boolean(node.data?.aiPrompt?.trim());
  }
  if (node.type === NODE_TYPE.AGENT) {
    return (
      Boolean(node.data?.brief?.trim()) &&
      node.data?.status !== RUN_STATUS.RUNNING &&
      node.data?.status !== RUN_STATUS.PENDING
    );
  }
  return true;
}

/** Runnable nodes in execution order. */
export function generationOrder(nodes, edges) {
  const { order, hasCycle } = topoSort(nodes, edges);
  if (hasCycle) return { order: [], hasCycle: true };

  const byId = indexNodes(nodes);
  return {
    order: order.filter((id) => isRunnableNode(byId.get(id))),
    hasCycle: false,
  };
}

/**
 * Whether a node is an independent remote API job.
 *
 * Dedicated API image and video nodes, plus generate and video nodes switched
 * to API mode, submit provider jobs without sharing the chat conversation.
 * The workflow executor may run these jobs in parallel.
 */
export function isParallelApiNode(node) {
  return (
    node?.type === NODE_TYPE.API_IMAGE ||
    node?.type === NODE_TYPE.API_VIDEO ||
    node?.type === NODE_TYPE.API_AUDIO ||
    node?.type === NODE_TYPE.API_3D ||
    ((node?.type === NODE_TYPE.GENERATE || node?.type === NODE_TYPE.VIDEO) &&
      node.data?.executionMode === EXECUTION_MODE.API)
  );
}

/** Whether running this graph needs an attached chat page. */
export function workflowNeedsHost(nodes) {
  return nodes.some(
    (node) =>
      ((node.type === NODE_TYPE.GENERATE ||
        node.type === NODE_TYPE.VIDEO ||
        node.type === NODE_TYPE.STORYBOARD) &&
        node.data?.executionMode !== EXECUTION_MODE.API) ||
      (node.type === NODE_TYPE.PROMPT &&
        Boolean(node.data?.aiPrompt?.trim())) ||
      // An empty storyboard splits its story through a chat before rendering.
      (node.type === NODE_TYPE.STORYBOARD &&
        !(Array.isArray(node.data?.shots) && node.data.shots.length > 0)),
  );
}

/** Every asset id (image, video, audio) referenced anywhere in the graph, for pruning, export, and hydration. */
export function referencedImageIds(nodes) {
  const ids = [];
  if (!Array.isArray(nodes)) return ids;

  const pushId = (id) => {
    if (typeof id === "string" && id.trim().length > 0) {
      ids.push(id.trim());
    }
  };

  nodes.forEach((node) => {
    const data = node?.data;
    if (!data) return;

    if (data.imageId) pushId(data.imageId);
    if (data.logoImageId) pushId(data.logoImageId);
    if (data.layoutReferenceImage) pushId(data.layoutReferenceImage);
    if (data.assetId) pushId(data.assetId);
    if (data.audioId) pushId(data.audioId);
    if (data.videoId) pushId(data.videoId);
    if (data.sheetImageId) pushId(data.sheetImageId);
    if (data.editorSource?.assetId) pushId(data.editorSource.assetId);

    if (Array.isArray(data.results)) data.results.forEach(pushId);
    if (Array.isArray(data.imageIds)) data.imageIds.forEach(pushId);
    if (Array.isArray(data.assetIds)) data.assetIds.forEach(pushId);
    if (Array.isArray(data.audioIds)) data.audioIds.forEach(pushId);
    if (Array.isArray(data.videoIds)) data.videoIds.forEach(pushId);
    if (Array.isArray(data.storyboardClips)) {
      data.storyboardClips.forEach((entry) => entry?.clipIds?.forEach(pushId));
    }
    // Storyboard keyframes live on their shots, not in `results`.
    if (Array.isArray(data.shots)) {
      data.shots.forEach((shot) => pushId(shot?.keyframeId));
    }

    // Clip timeline entries (video & image segments)
    if (Array.isArray(data.timeline)) {
      data.timeline.forEach((entry) => {
        if (entry?.assetId) pushId(entry.assetId);
      });
    }

    // Clip audio tracks (BGM, sound effects, voiceover)
    if (Array.isArray(data.audioTracks)) {
      data.audioTracks.forEach((track) => {
        if (track?.assetId) pushId(track.assetId);
        if (track?.audioId) pushId(track.audioId);
      });
    }

    // Clip overlays (PiP videos, stickers, watermarks, image overlays)
    if (Array.isArray(data.overlays)) {
      data.overlays.forEach((overlay) => {
        if (overlay?.pipAssetId) pushId(overlay.pipAssetId);
        if (overlay?.assetId) pushId(overlay.assetId);
        if (overlay?.imageId) pushId(overlay.imageId);
        if (overlay?.pip?.assetId) pushId(overlay.pip.assetId);
      });
    }

    // Editor documents hold their own image layers and mattes (base image,
    // inserts, mask blobs); those blobs must survive pruning for as long as
    // the document does. The current format stores them per editor node; the
    // fabric-era format is kept so old documents still protect theirs.
    const editorNodes = data.editorDoc?.nodes;
    if (Array.isArray(editorNodes)) {
      editorNodes.forEach((editorNode) => {
        if (editorNode?.imageId) pushId(editorNode.imageId);
        // Media layers remain editable after saving a flattened cover image.
        // Pruning or project export must never discard their original assets.
        if (editorNode?.assetId) pushId(editorNode.assetId);
        if (editorNode?.instance?.videoAssetId)
          pushId(editorNode.instance.videoAssetId);
        if (editorNode?.maskId) pushId(editorNode.maskId);
      });
    }
    const editorObjects = data.editorDoc?.objects;
    if (Array.isArray(editorObjects)) {
      editorObjects.forEach((object) => {
        if (object?.__ciwImageId) pushId(object.__ciwImageId);
      });
    }
  });
  return ids;
}

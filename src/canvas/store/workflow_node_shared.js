// Shared group-member helpers for workflow result ingestion.
import { HANDLE, createNode, NODE_TYPE } from "../nodes/types.js";
import { referencedImageIds } from "../engine/graph_run.js";
import {
  computeAppendWaterfallPositions,
  computeGroupBounds,
} from "./workflow_group_waterfall.js";

/** Media handle → the node type that owns one generated result in a Group. */
export function groupMemberTypeForMedia(mediaType) {
  if (
    mediaType === HANDLE.IMAGE ||
    mediaType === HANDLE.VIDEO ||
    mediaType === HANDLE.AUDIO ||
    mediaType === HANDLE.MODEL_3D
  ) {
    return NODE_TYPE.PREVIEW;
  }
  return null;
}

/** All asset ids a Group member currently owns (images, videos, audios). */
export function memberAssetIds(node) {
  return [...new Set(referencedImageIds([node]))];
}

/** Media types the source is actually sending over its incoming edges. */
export function mediaTypesFromTargetEdges(edges) {
  const types = new Set();
  for (const edge of edges) {
    if (
      edge.sourceHandle === HANDLE.IMAGE ||
      edge.sourceHandle === HANDLE.VIDEO ||
      edge.sourceHandle === HANDLE.AUDIO ||
      edge.sourceHandle === HANDLE.MODEL_3D
    ) {
      types.add(edge.sourceHandle);
    }
  }
  return [...types];
}

/**
 * Appends a batch below every existing member. Never reflows old members:
 * a user who hand-placed a child keeps that child's coordinates, and a new
 * generation only extends the group downward/rightward.
 */
export function groupMemberPositions(group, existingMembers, types) {
  return computeAppendWaterfallPositions(group, existingMembers, types);
}

/** Grows a Group container just enough to contain its members; never shrinks. */
export function groupExpandedForMembers(group, members) {
  const bounds = computeGroupBounds(group, members);
  const oldWidth = Number.parseFloat(group.style?.width) || group.width || 300;
  const oldHeight =
    Number.parseFloat(group.style?.height) || group.height || 200;
  return {
    ...group,
    style: {
      ...(group.style ?? {}),
      width: Math.max(oldWidth, bounds.width),
      height: Math.max(oldHeight, bounds.height),
    },
  };
}

/** Exactly sizes a Group container to its members (can shrink too). */
export function groupFitToMembers(group, members) {
  const bounds = computeGroupBounds(group, members);
  return {
    ...group,
    style: {
      ...(group.style ?? {}),
      width: bounds.width,
      height: bounds.height,
    },
  };
}

/** Builds one independent child node that owns a generated result. */
export function createGroupMemberNode({
  assetId,
  mediaType,
  sourceNodeId,
  groupId,
  position,
  index,
  aspectRatio,
}) {
  const type = groupMemberTypeForMedia(mediaType) || NODE_TYPE.PREVIEW;
  const overrides = {
    sourceNodeId,
    origin: "generated",
    mediaType,
    assetId,
    imageId: mediaType === HANDLE.IMAGE ? assetId : null,
    filename: `output-${sourceNodeId}-${index + 1}`,
  };
  if (
    typeof assetId === "string" &&
    (assetId.startsWith("data:") ||
      assetId.startsWith("blob:") ||
      assetId.startsWith("http://") ||
      assetId.startsWith("https://"))
  ) {
    overrides.url = assetId;
  }
  if (aspectRatio) overrides.aspectRatio = aspectRatio;
  const node = createNode(type, position, overrides);
  node.parentNode = groupId;
  return node;
}

/** Adding, updating, duplicating, and aligning nodes in the workflow. */

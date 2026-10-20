import {
  collectImageBatchInputs,
  collectImageInputs,
  resolveGalleryImageIds,
} from "../engine/graph.js";
import { RUN_STATUS } from "./node_enums.js";

/**
 * Fine-grained store selectors for the media node components.
 *
 * Subscribing to whole `state.images`/`state.nodes` made every node re-render
 * on every drag frame and on every image that landed anywhere in the workflow.
 * These factories bind a node id (or an id list) instead, so a selector's
 * output only changes when something the node actually renders has changed.
 * Array outputs contain strings/null only, so `useShallow` can compare them by
 * value and keep the previous reference for unrelated state changes.
 */

/**
 * The image ids a Gallery tile shows: live batch inputs plus its remembered
 * history, resolved exactly like the render path does. Output order follows
 * the sources' canvas layout, so dragging one of the Gallery's own sources
 * still invalidates it — dragging anything else does not.
 */
export function makeGalleryImageIdsSelector(nodeId) {
  return (state) => {
    const data = state.nodes.find((node) => node.id === nodeId)?.data ?? {};
    const liveImageIds = collectImageBatchInputs(
      nodeId,
      state.nodes,
      state.edges,
    )
      .map((input) => input.imageId)
      .reverse();
    return resolveGalleryImageIds(data, liveImageIds);
  };
}
/**
 * Resolves a list of image ids to their stored URLs, in the same order.
 * Thumbnails win over full-res so canvas nodes stop decoding multi-megabyte
 * originals just to show a preview (plan 4.3); ids without a thumbnail fall
 * back to the full image.
 */
export function makeImageUrlsSelector(imageIds) {
  return (state) =>
    imageIds.map(
      (imageId) => state.thumbnails?.[imageId] ?? state.images[imageId] ?? null,
    );
}

/** Full-resolution URLs for the active result and file operations. */
export function makeFullImageUrlsSelector(imageIds) {
  return (state) => imageIds.map((imageId) => state.images[imageId] ?? null);
}

/** The stored URL of one image, or null when the node has none. */
export function makeImageUrlSelector(imageId) {
  return (state) =>
    imageId
      ? (state.thumbnails?.[imageId] ?? state.images[imageId] ?? null)
      : null;
}

/** How many upstream generation/editor nodes currently feed an image in. */
export function makeLinkedImageCountSelector(nodeId) {
  return (state) =>
    collectImageInputs(nodeId, state.nodes, state.edges).filter(
      (entry) => entry.imageId,
    ).length;
}

/** Whether any upstream node connected to this target node is currently running or pending. */
export function makeUpstreamRunningSelector(nodeId) {
  return (state) => {
    const upstreamIds = new Set(
      state.edges
        .filter((edge) => edge.target === nodeId)
        .map((edge) => edge.source),
    );
    if (upstreamIds.size === 0) return false;
    return state.nodes.some(
      (node) =>
        upstreamIds.has(node.id) &&
        (node.data?.status === RUN_STATUS.RUNNING ||
          node.data?.status === RUN_STATUS.PENDING),
    );
  };
}

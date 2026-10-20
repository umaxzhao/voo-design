/**
 * @file reviewDiffHelper.js
 * Read-only view-model and diff extraction helper for agent change set reviews.
 * Inspects real affectedObjects.before and after snapshots and live store objects.
 */

import { isObjectManuallyModified } from "./changesetReview.js";

/** Keys in node.data to ignore during generic scalar property diffing. */
const IGNORED_DATA_KEYS = new Set([
  "results",
  "mentions",
  "history",
  "source",
  "canvas",
  "remoteJob",
  "error",
  "stage",
  "status",
  "selectedVersionId",
  "versions",
  "selectedIndex",
]);

/**
 * Extract human-readable property diffs between before and after node snapshots.
 *
 * @param {Object|null} beforeNode
 * @param {Object|null} afterNode
 * @returns {Array<{ key: string, labelKey: string, before: any, after: any, type: 'text'|'property'|'position' }>}
 */
export function extractNodePropertyDiff(beforeNode, afterNode) {
  if (!beforeNode && !afterNode) return [];
  const diffs = [];

  const bData = beforeNode?.data || {};
  const aData = afterNode?.data || {};

  // 1. Text / Prompt changes
  const bPrompt =
    typeof bData.prompt === "string" ? bData.prompt : (bData.aiPrompt ?? "");
  const aPrompt =
    typeof aData.prompt === "string" ? aData.prompt : (aData.aiPrompt ?? "");
  if (bPrompt !== aPrompt && (bPrompt || aPrompt)) {
    diffs.push({
      key: "prompt",
      labelKey: "agent.review.diffPrompt",
      before: bPrompt || null,
      after: aPrompt || null,
      type: "text",
    });
  }

  // 2. Title / Label changes
  const bTitle = bData.label || bData.title || "";
  const aTitle = aData.label || aData.title || "";
  if (bTitle !== aTitle && (bTitle || aTitle)) {
    diffs.push({
      key: "title",
      labelKey: "agent.review.diffLabel",
      before: bTitle || null,
      after: aTitle || null,
      type: "text",
    });
  }

  // 3. Known key execution parameters
  const paramKeys = [
    { key: "aspectRatio", labelKey: "agent.review.diffAspectRatio" },
    { key: "resolution", labelKey: "agent.review.diffResolution" },
    { key: "count", labelKey: "agent.review.diffCount" },
    { key: "modelId", labelKey: "agent.review.diffModel" },
    { key: "providerId", labelKey: "agent.review.diffProvider" },
    { key: "platform", labelKey: "agent.review.diffPlatform" },
  ];

  for (const { key, labelKey } of paramKeys) {
    const bVal = bData[key];
    const aVal = aData[key];
    if (bVal !== undefined && aVal !== undefined && bVal !== aVal) {
      diffs.push({
        key,
        labelKey,
        before: String(bVal),
        after: String(aVal),
        type: "property",
      });
    }
  }

  // 4. Position diff (if moved significantly)
  if (beforeNode?.position && afterNode?.position) {
    const dx = Math.abs(
      (beforeNode.position.x || 0) - (afterNode.position.x || 0),
    );
    const dy = Math.abs(
      (beforeNode.position.y || 0) - (afterNode.position.y || 0),
    );
    if (dx >= 1 || dy >= 1) {
      diffs.push({
        key: "position",
        labelKey: "agent.review.diffPosition",
        before: `${Math.round(beforeNode.position.x || 0)}, ${Math.round(beforeNode.position.y || 0)}`,
        after: `${Math.round(afterNode.position.x || 0)}, ${Math.round(afterNode.position.y || 0)}`,
        type: "position",
      });
    }
  }

  // 5. Check any other scalar properties in data
  const allKeys = new Set([...Object.keys(bData), ...Object.keys(aData)]);
  for (const key of allKeys) {
    if (
      IGNORED_DATA_KEYS.has(key) ||
      key === "prompt" ||
      key === "aiPrompt" ||
      key === "label" ||
      key === "title" ||
      paramKeys.some((p) => p.key === key)
    ) {
      continue;
    }
    const bVal = bData[key];
    const aVal = aData[key];
    if (
      bVal !== aVal &&
      (typeof bVal !== "object" || bVal === null) &&
      (typeof aVal !== "object" || aVal === null)
    ) {
      diffs.push({
        key,
        labelKey: `agent.review.diffPropGeneric`,
        before: bVal !== undefined ? String(bVal) : null,
        after: aVal !== undefined ? String(aVal) : null,
        type: "property",
      });
    }
  }

  return diffs;
}

/**
 * Resolves an image URI / data URL from a node snapshot using existing asset reading.
 *
 * @param {Object|null} node - Node snapshot
 * @param {Object} [storeState] - Live workflow store state (e.g. from getStore())
 * @returns {string|null}
 */
export function resolveNodeImageUri(node, storeState = {}) {
  if (!node?.data) return null;
  const data = node.data;

  // Direct URLs on node
  if (typeof data.imageUrl === "string" && data.imageUrl) return data.imageUrl;
  if (typeof data.url === "string" && data.url) return data.url;
  if (typeof data.src === "string" && data.src) return data.src;
  if (typeof data.preview === "string" && data.preview) return data.preview;

  // Look in results array
  if (Array.isArray(data.results) && data.results.length > 0) {
    const idx = typeof data.selectedIndex === "number" ? data.selectedIndex : 0;
    const item = data.results[idx] || data.results[0];
    if (item) {
      if (typeof item === "object") {
        const u = item.dataUrl || item.fullDataUrl || item.url;
        if (typeof u === "string" && u) return u;
      } else if (typeof item === "string") {
        if (storeState.thumbnails?.[item]) return storeState.thumbnails[item];
        if (storeState.images?.[item]) return storeState.images[item];
      }
    }
  }

  // Look in imageId
  if (typeof data.imageId === "string" && data.imageId) {
    if (storeState.thumbnails?.[data.imageId])
      return storeState.thumbnails[data.imageId];
    if (storeState.images?.[data.imageId])
      return storeState.images[data.imageId];
  }

  return null;
}

/**
 * Builds the complete visual review view-model for one affected object.
 *
 * @param {Object} affectedObj - Affected object from changeSet
 * @param {Object|null} currentLiveObj - Corresponding live object from canvas
 * @param {Object} [storeState] - Live store state
 * @returns {Object}
 */
export function buildObjectReviewModel(
  affectedObj,
  currentLiveObj,
  storeState = {},
) {
  const isConflict = Boolean(
    currentLiveObj !== undefined &&
    isObjectManuallyModified(
      currentLiveObj,
      affectedObj.after,
      affectedObj.type,
      {
        ignorePosition: affectedObj.action === "created",
      },
    ),
  );

  const beforeImage = resolveNodeImageUri(affectedObj.before, storeState);
  const afterImage = resolveNodeImageUri(affectedObj.after, storeState);
  const propertyDiffs =
    affectedObj.type === "node"
      ? extractNodePropertyDiff(affectedObj.before, affectedObj.after)
      : [];

  return {
    id: affectedObj.id,
    type: affectedObj.type,
    action: affectedObj.action,
    name: affectedObj.name || affectedObj.id,
    isConflict,
    beforeImage,
    afterImage,
    hasImageDiff: Boolean(beforeImage || afterImage),
    propertyDiffs,
  };
}

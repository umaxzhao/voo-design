/**
 * @file staleRevision.js
 * Implements stale revision tracking, conflict detection, and automatic
 * re-planning / user resolution for Agent OS (docs/roadmap-voo-agent-os.md §2).
 *
 * Single source of truth: Reuses isObjectManuallyModified from changesetReview.js.
 */

import {
  isObjectManuallyModified,
  getNodeLabel,
  deepClone,
} from "./changesetReview.js";

/** Maximum automatic re-planning retries upon stale revision conflict before user prompt. */
export const MAX_STALE_REPLAN_RETRIES = 1;

/**
 * Extract monotonic revision number from a node or edge.
 *
 * @param {Object|null} obj
 * @returns {number}
 */
export function getNodeRev(obj) {
  if (!obj) return 0;
  if (typeof obj.rev === "number") return obj.rev;
  if (typeof obj.data?.rev === "number") return obj.data.rev;
  return 0;
}

/**
 * Extract target object IDs that a tool call intends to mutate.
 *
 * @param {string} toolName
 * @param {Object} args
 * @returns {string[]} Unique array of target IDs
 */
export function extractTargetObjectIds(toolName, args) {
  if (!args || typeof args !== "object") return [];
  const ids = [];

  if (typeof args.nodeId === "string" && args.nodeId) {
    ids.push(args.nodeId);
  }
  if (typeof args.targetId === "string" && args.targetId) {
    ids.push(args.targetId);
  }
  if (Array.isArray(args.nodeIds)) {
    for (const id of args.nodeIds) {
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  if (Array.isArray(args.targetIds)) {
    for (const id of args.targetIds) {
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  if (Array.isArray(args.updates)) {
    for (const update of args.updates) {
      if (typeof update?.nodeId === "string" && update.nodeId) {
        ids.push(update.nodeId);
      }
    }
  }
  if (typeof args.sourceNodeId === "string" && args.sourceNodeId) {
    ids.push(args.sourceNodeId);
  }
  if (typeof args.targetNodeId === "string" && args.targetNodeId) {
    ids.push(args.targetNodeId);
  }
  if (typeof args.source === "string" && args.source) {
    ids.push(args.source);
  }
  if (typeof args.target === "string" && args.target) {
    ids.push(args.target);
  }

  return [...new Set(ids)];
}

/**
 * Record an object's revision and state into the observed revisions map.
 *
 * @param {Map<string, { id: string, rev: number, snapshot: Object, readAt: number }>} observedRevs
 * @param {Object} obj
 */
export function recordObservedObject(observedRevs, obj) {
  if (!observedRevs || !obj || !obj.id) return;
  observedRevs.set(obj.id, {
    id: obj.id,
    rev: getNodeRev(obj),
    snapshot: deepClone(obj),
    readAt: Date.now(),
  });
}

/**
 * Record a collection of objects into the observed revisions map.
 *
 * @param {Map<string, { id: string, rev: number, snapshot: Object, readAt: number }>} observedRevs
 * @param {Array<Object>} objects
 */
export function recordObservedObjects(observedRevs, objects) {
  if (!observedRevs || !Array.isArray(objects)) return;
  for (const obj of objects) {
    recordObservedObject(observedRevs, obj);
  }
}

/**
 * Compute property differences between read snapshot and current state.
 *
 * @param {Object|null} beforeObj
 * @param {Object|null} afterObj
 * @returns {Object}
 */
export function computeObjectDiff(beforeObj, afterObj) {
  if (!beforeObj && !afterObj) return {};
  if (!beforeObj) return { action: "created", after: deepClone(afterObj) };
  if (!afterObj) return { action: "deleted", before: deepClone(beforeObj) };

  const diff = {};
  const bRev = getNodeRev(beforeObj);
  const aRev = getNodeRev(afterObj);
  if (bRev !== aRev) {
    diff.rev = { before: bRev, after: aRev };
  }

  if (
    beforeObj.position?.x !== afterObj.position?.x ||
    beforeObj.position?.y !== afterObj.position?.y
  ) {
    diff.position = {
      before: deepClone(beforeObj.position),
      after: deepClone(afterObj.position),
    };
  }

  const beforeData = beforeObj.data || {};
  const afterData = afterObj.data || {};
  const allKeys = new Set([
    ...Object.keys(beforeData),
    ...Object.keys(afterData),
  ]);

  for (const key of allKeys) {
    const bVal = beforeData[key];
    const aVal = afterData[key];
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diff[key] = { before: deepClone(bVal), after: deepClone(aVal) };
    }
  }

  return diff;
}

/**
 * Format a human-readable summary of the diff.
 *
 * @param {string} name
 * @param {string} id
 * @param {string} modifiedBy
 * @param {Object|null} beforeObj
 * @param {Object|null} afterObj
 * @param {Object} diff
 * @returns {string}
 */
export function formatDiffSummary(
  name,
  id,
  modifiedBy,
  beforeObj,
  afterObj,
  diff,
) {
  if (!afterObj) {
    return `Object '${name}' (${id}) was deleted by ${modifiedBy}.`;
  }
  if (!beforeObj) {
    return `Object '${name}' (${id}) was created by ${modifiedBy}.`;
  }

  const changes = [];
  for (const [key, val] of Object.entries(diff)) {
    if (key === "rev") {
      changes.push(`rev ${val.before} -> ${val.after}`);
    } else if (key === "position") {
      changes.push("position moved");
    } else {
      changes.push(`${key} changed`);
    }
  }

  const changeText =
    changes.length > 0 ? changes.join(", ") : "content updated";
  return `Object '${name}' (${id}) was modified by ${modifiedBy}: ${changeText}.`;
}

/**
 * Check if any target object of a mutating tool has a stale revision or
 * manual modification since it was read.
 *
 * @param {Object} params
 * @param {string} params.toolName
 * @param {Object} params.args
 * @param {Object} params.store
 * @param {Map<string, Object>} params.observedRevs
 * @param {Set<string>} [params.agentModifiedIds]
 * @returns {{ hasConflict: boolean, conflict?: { objectId: string, objectType: 'node'|'edge', name: string, modifiedBy: 'user'|'collab'|'agent', readRev: number, currentRev: number, diff: Object, summary: string } }}
 */
export function checkStaleRevision({
  toolName,
  args,
  store,
  observedRevs,
  agentModifiedIds = new Set(),
}) {
  if (!store || !observedRevs || observedRevs.size === 0) {
    return { hasConflict: false };
  }

  const targetIds = extractTargetObjectIds(toolName, args);
  if (targetIds.length === 0) {
    return { hasConflict: false };
  }

  for (const targetId of targetIds) {
    const tracked = observedRevs.get(targetId);
    if (!tracked) continue;

    const currentObj =
      store.nodes?.find((n) => n.id === targetId) ??
      store.edges?.find((e) => e.id === targetId) ??
      null;

    const readRev = tracked.rev ?? 0;
    const currentRev = getNodeRev(currentObj);
    const isRevMismatch = currentRev !== readRev;

    const objType = currentObj?.type ? "node" : "edge";
    const isContentModified = isObjectManuallyModified(
      currentObj,
      tracked.snapshot,
      objType,
    );

    if (isRevMismatch || isContentModified) {
      let modifiedBy = "user";
      if (currentObj?.lastModifiedBy) {
        modifiedBy = currentObj.lastModifiedBy;
      } else if (currentObj?.modifiedBy) {
        modifiedBy = currentObj.modifiedBy;
      } else if (
        currentObj?.source === "collab" ||
        store.collabSession ||
        store.remoteUpdate
      ) {
        modifiedBy = "collab";
      } else if (agentModifiedIds.has(targetId)) {
        modifiedBy = "agent";
      }

      const diff = computeObjectDiff(tracked.snapshot, currentObj);
      const name = getNodeLabel(currentObj || tracked.snapshot);
      const summary = formatDiffSummary(
        name,
        targetId,
        modifiedBy,
        tracked.snapshot,
        currentObj,
        diff,
      );

      return {
        hasConflict: true,
        conflict: {
          objectId: targetId,
          objectType: objType,
          name,
          modifiedBy,
          readRev,
          currentRev,
          diff,
          summary,
        },
      };
    }
  }

  return { hasConflict: false };
}

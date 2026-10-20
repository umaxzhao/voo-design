/**
 * @file changesetReview.js
 * Implements transaction-level ChangeSet review, snapshotting, partial accept,
 * conflict protection, and agent-level rollback (P0-2, P0-5).
 */

import { stripWorkflowHistoryTransientState } from "../../store/workflow_history_actions.js";
import { commitWorkflowHistory } from "../../undo-action-contracts.js";
import { useWorkflowStore } from "../../store/workflow_store.js";

/**
 * Deep clone a plain object or array safely.
 *
 * @template T
 * @param {T} val
 * @returns {T}
 */
export function deepClone(val) {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }
  return JSON.parse(JSON.stringify(val));
}

/**
 * Extract a human-readable name/label for a node.
 *
 * @param {Object} [node]
 * @returns {string}
 */
export function getNodeLabel(node) {
  if (!node) return "Node";
  return (
    node.data?.label ||
    node.data?.title ||
    node.data?.prompt ||
    node.title ||
    node.type ||
    node.id ||
    "Node"
  );
}

/**
 * Extract a human-readable name/label for an edge.
 *
 * @param {Object} [edge]
 * @returns {string}
 */
export function getEdgeLabel(edge) {
  if (!edge) return "Edge";
  if (edge.label) return String(edge.label);
  if (edge.source && edge.target) {
    return `${edge.source} → ${edge.target}`;
  }
  return edge.id || "Edge";
}

/**
 * Captures a lightweight snapshot of current nodes and edges on canvas.
 * Does not clone unchanged objects deeply until diffing is performed.
 *
 * @param {Object} [store] - Workflow store or state object.
 * @returns {{ nodes: Map<string, Object>, edges: Map<string, Object> }}
 */
export function captureAffectedSnapshot(store) {
  const nodesMap = new Map();
  const edgesMap = new Map();

  if (!store) {
    return { nodes: nodesMap, edges: edgesMap };
  }

  const rawNodes = Array.isArray(store.nodes) ? store.nodes : [];
  const rawEdges = Array.isArray(store.edges) ? store.edges : [];

  const strippedNodes = stripWorkflowHistoryTransientState(rawNodes);

  for (const node of strippedNodes) {
    if (node?.id) {
      nodesMap.set(node.id, deepClone(node));
    }
  }

  for (const edge of rawEdges) {
    if (edge?.id) {
      edgesMap.set(edge.id, deepClone(edge));
    }
  }

  return { nodes: nodesMap, edges: edgesMap };
}

/**
 * Computes difference between before and after snapshots.
 * Returns only the affected objects (never the whole canvas).
 *
 * @param {{ nodes: Map<string, Object>, edges: Map<string, Object> }|null} beforeSnapshot
 * @param {{ nodes: Map<string, Object>, edges: Map<string, Object> }|null} afterSnapshot
 * @returns {{ affectedObjects: Array<{ id: string, type: 'node'|'edge', action: 'created'|'modified'|'deleted', name: string, before: Object|null, after: Object|null }> }}
 */
export function diffAffectedObjects(beforeSnapshot, afterSnapshot) {
  const beforeNodes = beforeSnapshot?.nodes || new Map();
  const afterNodes = afterSnapshot?.nodes || new Map();
  const beforeEdges = beforeSnapshot?.edges || new Map();
  const afterEdges = afterSnapshot?.edges || new Map();

  const affectedObjects = [];

  // 1. Check after nodes for created or modified
  for (const [id, afterNode] of afterNodes.entries()) {
    const beforeNode = beforeNodes.get(id);
    if (!beforeNode) {
      affectedObjects.push({
        id,
        type: "node",
        action: "created",
        name: getNodeLabel(afterNode),
        before: null,
        after: deepClone(afterNode),
      });
    } else {
      const bClean = stripWorkflowHistoryTransientState([beforeNode])[0];
      const aClean = stripWorkflowHistoryTransientState([afterNode])[0];
      if (JSON.stringify(bClean) !== JSON.stringify(aClean)) {
        affectedObjects.push({
          id,
          type: "node",
          action: "modified",
          name: getNodeLabel(afterNode),
          before: deepClone(beforeNode),
          after: deepClone(afterNode),
        });
      }
    }
  }

  // 2. Check before nodes for deleted
  for (const [id, beforeNode] of beforeNodes.entries()) {
    if (!afterNodes.has(id)) {
      affectedObjects.push({
        id,
        type: "node",
        action: "deleted",
        name: getNodeLabel(beforeNode),
        before: deepClone(beforeNode),
        after: null,
      });
    }
  }

  // 3. Check after edges for created or modified
  for (const [id, afterEdge] of afterEdges.entries()) {
    const beforeEdge = beforeEdges.get(id);
    if (!beforeEdge) {
      affectedObjects.push({
        id,
        type: "edge",
        action: "created",
        name: getEdgeLabel(afterEdge),
        before: null,
        after: deepClone(afterEdge),
      });
    } else if (JSON.stringify(beforeEdge) !== JSON.stringify(afterEdge)) {
      affectedObjects.push({
        id,
        type: "edge",
        action: "modified",
        name: getEdgeLabel(afterEdge),
        before: deepClone(beforeEdge),
        after: deepClone(afterEdge),
      });
    }
  }

  // 4. Check before edges for deleted
  for (const [id, beforeEdge] of beforeEdges.entries()) {
    if (!afterEdges.has(id)) {
      affectedObjects.push({
        id,
        type: "edge",
        action: "deleted",
        name: getEdgeLabel(beforeEdge),
        before: deepClone(beforeEdge),
        after: null,
      });
    }
  }

  return { affectedObjects };
}

/**
 * Checks if an object has been manually modified by the user after the tool execution.
 * If modified, the object must NOT be overwritten on rollback (Conflict Protection).
 *
 * @param {Object|null} currentObj - Current object in the live canvas store.
 * @param {Object|null} afterSnapshotObj - Snapshot of the object right after the tool ran.
 * @param {'node'|'edge'} type
 * @param {{ ignorePosition?: boolean }} [options] - ignorePosition skips the
 *   node position (layout moves by the agent's tidy or a Group reflow).
 * @returns {boolean} True if manually modified; false if unchanged since tool run.
 */
export function isObjectManuallyModified(
  currentObj,
  afterSnapshotObj,
  type,
  { ignorePosition = false } = {},
) {
  if (type === "node") {
    // If the tool deleted it:
    if (afterSnapshotObj === null) {
      // If it exists now, the user manually recreated or restored it!
      return currentObj !== null && currentObj !== undefined;
    }
    // If the tool created or modified it:
    if (currentObj === null || currentObj === undefined) {
      // User manually deleted it!
      return true;
    }
    // Compare stripped states to ignore transient UI flags (like selected)
    // and ReactFlow-injected layout measurements (width, height, measured, positionAbsolute)
    const curClean = stripWorkflowHistoryTransientState([currentObj])[0];
    const aftClean = stripWorkflowHistoryTransientState([afterSnapshotObj])[0];
    
    // Strip ReactFlow runtime layout artifacts that are injected upon DOM mounting
    const cleanNodeForComparison = (n) => {
      if (!n || typeof n !== "object") return n;
      const ignoredKeys = new Set([
        "width",
        "height",
        "measured",
        "positionAbsolute",
        "dragging",
        "resizing",
        "selected",
        "zIndex",
        ...(ignorePosition ? ["position"] : []),
      ]);
      return Object.fromEntries(
        Object.entries(n).filter(([k]) => !ignoredKeys.has(k)),
      );
    };

    return (
      JSON.stringify(cleanNodeForComparison(curClean)) !==
      JSON.stringify(cleanNodeForComparison(aftClean))
    );
  }

  if (type === "edge") {
    if (afterSnapshotObj === null) {
      return currentObj !== null && currentObj !== undefined;
    }
    if (currentObj === null || currentObj === undefined) {
      return true;
    }
    return JSON.stringify(currentObj) !== JSON.stringify(afterSnapshotObj);
  }

  return false;
}

/**
 * Executes rollback for a given ChangeSet on the canvas store.
 * Supports full rollback or partial rollback by specifying `objectIds`.
 * Enforces Conflict Protection: manually modified objects are skipped and reported.
 * Enters editor undo stack so the user can redo.
 *
 * @param {Object} store - Workflow store instance.
 * @param {Object} changeSet - ChangeSet containing `undoData`.
 * @param {Object} [options]
 * @param {string[]} [options.objectIds] - If provided, only revert these object IDs.
 * @param {boolean} [options.force=false] - If true, bypasses manual modification check.
 * @returns {{ success: boolean, revertedCount: number, revertedIds: string[], skipped: Array<{ id: string, name: string, reason: string }>, degraded: boolean }}
 */
export function rollbackChangeSet(store, changeSet, options = {}) {
  const affected = changeSet?.undoData?.affectedObjects;

  // Graceful degradation for legacy changeSets without undoData
  if (!Array.isArray(affected) || affected.length === 0) {
    return {
      success: true,
      revertedCount: 0,
      revertedIds: [],
      skipped: [],
      degraded: true,
    };
  }

  if (!store) {
    return {
      success: false,
      revertedCount: 0,
      revertedIds: [],
      skipped: [],
      degraded: false,
    };
  }

  const targetIds = Array.isArray(options.objectIds)
    ? new Set(options.objectIds)
    : null;

  const candidates = targetIds
    ? affected.filter((obj) => targetIds.has(obj.id))
    : affected;

  const revertable = [];
  const skipped = [];

  const currentNodes = Array.isArray(store.nodes) ? store.nodes : [];
  const currentEdges = Array.isArray(store.edges) ? store.edges : [];

  for (const item of candidates) {
    let current = null;
    if (item.type === "node") {
      current = currentNodes.find((n) => n.id === item.id) ?? null;
    } else if (item.type === "edge") {
      current = currentEdges.find((e) => e.id === item.id) ?? null;
    }

    // Conflict protection: reverting must not destroy a user's later edit.
    // The agent's own post-tool layout (turn-end tidy, Group reflow) moves
    // created nodes after the `after` snapshot, so for created nodes only the
    // position is ignored — a created node whose data the user edited is
    // still kept and reported instead of being deleted with the revert.
    if (
      !options.force &&
      isObjectManuallyModified(current, item.after, item.type, {
        ignorePosition: item.action === "created",
      })
    ) {
      skipped.push({
        id: item.id,
        type: item.type,
        name: item.name,
        reason: "manually_modified",
      });
    } else {
      revertable.push(item);
    }
  }

  if (revertable.length === 0) {
    return {
      success: true,
      revertedCount: 0,
      revertedIds: [],
      skipped,
      degraded: false,
    };
  }

  let nextNodes = [...currentNodes];
  let nextEdges = [...currentEdges];

  for (const item of revertable) {
    if (item.type === "node") {
      if (item.action === "created") {
        // Remove created node and its dangling edges
        nextNodes = nextNodes.filter((n) => n.id !== item.id);
        nextEdges = nextEdges.filter(
          (e) => e.source !== item.id && e.target !== item.id,
        );
      } else if (item.action === "modified") {
        // Restore before snapshot
        const idx = nextNodes.findIndex((n) => n.id === item.id);
        if (idx !== -1) {
          nextNodes[idx] = deepClone(item.before);
        } else if (item.before) {
          nextNodes.push(deepClone(item.before));
        }
      } else if (item.action === "deleted") {
        // Re-add deleted node
        if (item.before && !nextNodes.some((n) => n.id === item.id)) {
          nextNodes.push(deepClone(item.before));
        }
      }
    } else if (item.type === "edge") {
      if (item.action === "created") {
        nextEdges = nextEdges.filter((e) => e.id !== item.id);
      } else if (item.action === "modified") {
        const idx = nextEdges.findIndex((e) => e.id === item.id);
        if (idx !== -1) {
          nextEdges[idx] = deepClone(item.before);
        } else if (item.before) {
          nextEdges.push(deepClone(item.before));
        }
      } else if (item.action === "deleted") {
        if (item.before && !nextEdges.some((e) => e.id === item.id)) {
          nextEdges.push(deepClone(item.before));
        }
      }
    }
  }

  // Push history entry before mutation so the rollback is fully undoable/redoable
  try {
    commitWorkflowHistory(store, "workflow.agent.rollback");
  } catch {
    // Best-effort in test environments or stores without history adapter
  }

  // Commit changes to store
  if (
    typeof store?.setNodes === "function" &&
    typeof store?.setEdges === "function"
  ) {
    store.setNodes(nextNodes);
    store.setEdges(nextEdges);
  } else if (typeof useWorkflowStore?.setState === "function") {
    useWorkflowStore.setState({
      nodes: nextNodes,
      edges: nextEdges,
      rev: (Number(store?.rev ?? useWorkflowStore.getState()?.rev) || 0) + 1,
    });
  } else if (typeof store?.setState === "function") {
    store.setState({
      nodes: nextNodes,
      edges: nextEdges,
      rev: (Number(store.rev) || 0) + 1,
    });
  }

  if (store && typeof store === "object") {
    store.nodes = nextNodes;
    store.edges = nextEdges;
    store.rev = (Number(store.rev) || 0) + 1;
  }

  if (typeof store.scheduleSave === "function") {
    store.scheduleSave();
  }

  return {
    success: true,
    revertedCount: revertable.length,
    revertedIds: revertable.map((r) => r.id),
    skipped,
    degraded: false,
  };
}

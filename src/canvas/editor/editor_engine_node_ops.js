import { createNodeHitTester } from "./node-hit-test.js";
import { createNodeStackActions } from "./node-stack-actions.js";
/**
 * Node mutation, reordering, locking, removal, and hit-testing operations.
 *
 * Extracted from editor_engine.js to isolate node mutation operations and texture cleanup.
 */

import {
  canConvertToPath,
  convertShapeToPathNode,
  findNode,
  isLockedByGroup,
  NODE_KIND,
} from "./scene_model.js";
import {
  commitEditorDocument,
  commitOrPreviewEditorDocument,
} from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { offsetPathNode } from "./path_offset_node.js";
import { expandStrokeToPathNode } from "./path_expand_stroke.js";
import {
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  booleanExclude,
} from "./path_boolean_engine.js";
import { groupingRoots, sharedGroupParent } from "./group-structure.js";
import { createTextPathEngineOps } from "./editor_engine_text_path_ops.js";

export function createEngineNodeOps({
  getDoc, cache,
  setDoc,
  selection,
  getSelectedGroup,
  releaseNodeTextures,
  maskTools,
  paintTools,
  penTools,
  getEffectiveNode,
  requestRender,
  notify,
  getZoom,
}) {
  const stackActions = createNodeStackActions({ getDoc, setDoc,
    selection, getSelectedGroup, releaseNodeTextures, maskTools, paintTools, penTools, requestRender, notify });
  const { removeIds, removeNode, reorderNode, reorderNodeTo, reorderNodes,
    moveToFront, moveToBack, moveNodeToRoot, bringForward, sendBackward, bringToFront, sendToBack } = stackActions;

  function updateNode(id, patch, options) {
    return commitOrPreviewEditorDocument(
      "editor.document.set",
      setDoc,
      ops.updateNode(getDoc(), id, patch),
      options,
    );
  }

  function updateNodes(updates, options) {
    return commitOrPreviewEditorDocument(
      "editor.document.set",
      setDoc,
      ops.updateNodes(getDoc(), updates),
      options,
    );
  }






  function moveNodesBy(ids, dx, dy, options) {
    const list = Array.isArray(ids) ? ids : [ids];
    return commitOrPreviewEditorDocument(
      "editor.layer.move",
      setDoc,
      ops.moveWithFollowers(getDoc(), list, dx, dy),
      options,
    );
  }

  function moveNodeBy(id, dx, dy, options) {
    return moveNodesBy(id, dx, dy, options);
  }


  const nodeAtPoint = createNodeHitTester({ getDoc, getZoom, paintTools, getEffectiveNode, cache, maskTools });

  function toggleLockNode(id) {
    const doc = getDoc();
    const node = findNode(doc, id);
    if (!node) return;
    commitEditorDocument(
      "editor.layer.settings",
      setDoc,
      ops.updateNode(doc, id, { locked: !node.locked }),
    );
  }

  function setLockTransparency(id, next) {
    const doc = getDoc();
    const node = findNode(doc, id);
    if (!node) return;
    commitEditorDocument(
      "editor.layer.settings",
      setDoc,
      ops.updateNode(doc, id, { lockTransparency: Boolean(next) }),
    );
  }

  function setLockPosition(id, next) {
    const doc = getDoc();
    const node = findNode(doc, id);
    if (!node) return;
    commitEditorDocument(
      "editor.layer.settings",
      setDoc,
      ops.updateNode(doc, id, { lockPosition: Boolean(next) }),
    );
  }

  function setLockImagePixels(id, next) {
    const doc = getDoc();
    const node = findNode(doc, id);
    if (!node) return;
    commitEditorDocument(
      "editor.layer.settings",
      setDoc,
      ops.updateNode(doc, id, { lockImagePixels: Boolean(next) }),
    );
  }

  function convertSelectedToPath(targetId = null) {
    const doc = getDoc();
    const candidateIds = targetId
      ? [targetId]
      : (selection?.getIds?.() ?? (selection?.getId?.() ? [selection.getId()] : []));
    if (!candidateIds.length) return false;

    const idSet = new Set(candidateIds);
    let anyConverted = false;
    const nextNodes = doc.nodes.map((node) => {
      if (
        idSet.has(node.id) &&
        !node.locked &&
        !isLockedByGroup(doc, node) &&
        canConvertToPath(node)
      ) {
        const converted = convertShapeToPathNode(node);
        if (converted) {
          anyConverted = true;
          return converted;
        }
      }
      return node;
    });

    if (!anyConverted) return false;

    const next = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.layer.convertToPath", setDoc, next, {
      name: "editor.history.entry.convertToPath",
    });
    requestRender?.();
    notify?.();
    return true;
  }

  /**
   * Outsets (positive) or insets (negative) the single selected closed pen
   * path by `distance` document units. Returns false when nothing applies.
   */
  function offsetSelectedPath(distance) {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    if (selectedIds.length !== 1) return false;
    const node = findNode(doc, selectedIds[0]);
    if (!node || node.locked || isLockedByGroup(doc, node)) return false;
    const result = offsetPathNode(node, distance);
    if (!result.ok) return false;
    commitEditorDocument("editor.pen.change", setDoc, ops.updateNode(doc, node.id, result.node));
    requestRender?.();
    notify?.();
    return true;
  }

  /**
   * Expands the stroke of the selected node into a closed outline pen path.
   */
  function expandSelectedStroke() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    if (selectedIds.length !== 1) return false;
    const node = findNode(doc, selectedIds[0]);
    if (!node || node.locked || isLockedByGroup(doc, node)) return false;
    const expanded = expandStrokeToPathNode(node);
    if (!expanded) return false;
    // Expanding replaces this layer's geometry, not its identity or references.
    commitEditorDocument("editor.expand_stroke", setDoc, ops.updateNode(doc, node.id, { ...expanded, id: node.id }));
    requestRender?.();
    notify?.();
    return true;
  }

  /**
   * Executes a destructive vector boolean operation (union, subtract, intersect, exclude)
   * on two or more selected nodes.
   */
  function destructiveBoolean(op = "union") {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    if (selectedIds.length < 2) return false;
    const selectedNodes = selectedIds.map((id) => findNode(doc, id)).filter(Boolean);
    if (selectedNodes.length < 2) return false;
    if (selectedNodes.some((n) => n.locked || isLockedByGroup(doc, n))) return false;

    let result = null;
    if (op === "union") result = booleanUnion(selectedNodes);
    else if (op === "subtract") result = booleanSubtract(selectedNodes);
    else if (op === "intersect") result = booleanIntersect(selectedNodes);
    else if (op === "exclude") result = booleanExclude(selectedNodes);

    if (!result) return false;

    const parentId = sharedGroupParent(doc, selectedNodes);
    const consumedSet = new Set(selectedIds);
    const cleanedResult = { ...result, parentId };
    if (cleanedResult.clipTo && consumedSet.has(cleanedResult.clipTo)) {
      delete cleanedResult.clipTo;
    }

    let inserted = false;
    const nextNodes = [];
    for (const n of doc.nodes) {
      if (consumedSet.has(n.id)) {
        if (!inserted) {
          nextNodes.push(cleanedResult);
          inserted = true;
        }
        continue;
      }
      if (consumedSet.has(n.clipTo)) {
        const { clipTo, ...released } = n;
        nextNodes.push(released);
      } else {
        nextNodes.push(n);
      }
    }

    const nextDoc = ops.pruneEmptyGroups({ ...doc, nodes: nextNodes });
    commitEditorDocument(`editor.boolean.${op}`, setDoc, nextDoc);
    selection?.selectNodes?.([cleanedResult.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  const textPathOps = createTextPathEngineOps({
    getDoc,
    setDoc,
    selection,
    requestRender,
    notify,
  });

  return {
    removeIds,
    removeNode,
    updateNode,
    updateNodes,
    reorderNode,
    reorderNodes,
    reorderNodeTo,
    moveToFront,
    moveToBack,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    moveNodeBy,
    moveNodesBy,
    moveNodeToRoot,
    expandMoveSet: (ids) => ops.moveAffectedIds(getDoc(), ids),
    nodeAtPoint,
    nodesAtPoint: nodeAtPoint.nodesAtPoint,
    toggleLockNode,
    setLockTransparency,
    getLockTransparency: (id) =>
      Boolean(findNode(getDoc(), id)?.lockTransparency),
    setLockPosition,
    getLockPosition: (id) => Boolean(findNode(getDoc(), id)?.lockPosition),
    setLockImagePixels,
    getLockImagePixels: (id) =>
      Boolean(findNode(getDoc(), id)?.lockImagePixels),
    convertSelectedToPath,
    offsetSelectedPath,
    expandSelectedStroke,
    destructiveBoolean,
    ...textPathOps,
  };
}

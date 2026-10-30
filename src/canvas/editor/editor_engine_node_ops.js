/**
 * Node mutation, reordering, locking, removal, and hit-testing operations.
 *
 * Extracted from editor_engine.js to isolate node mutation operations and texture cleanup.
 */

import {
  canConvertToPath,
  convertShapeToPathNode,
  findNode,
  groupDescendants,
  isGroupNode,
  isLockedByGroup,
  NODE_KIND,
} from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
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
import { layoutTextOnPath } from "./text_on_path.js";
import { newId } from "./scene_model_core.js";

export function createEngineNodeOps({
  getDoc,
  setDoc,
  selection,
  releaseNodeTextures,
  maskTools,
  paintTools,
  penTools,
  getEffectiveNode,
  requestRender,
  notify,
  getZoom,
}) {
  function removeIds(ids) {
    const doc = getDoc();
    const expanded = new Set();
    for (const id of ids) {
      const node = findNode(doc, id);
      if (!node) continue;
      expanded.add(id);
      if (isGroupNode(node)) {
        for (const member of groupDescendants(doc, id)) expanded.add(member.id);
      }
    }
    let next = doc;
    for (const id of expanded) {
      releaseNodeTextures?.(findNode(doc, id));
      maskTools?.onNodeRemoved?.(id);
      paintTools?.onNodeRemoved?.(id);
      penTools?.onNodeRemoved?.(id);
      next = ops.removeNode(next, id);
    }
    for (const id of expanded) {
      next = ops.releaseClippingMasksTo(next, id);
    }
    next = ops.pruneEmptyGroups(next);
    if (next === doc) return false;
    commitEditorDocument("editor.layer.delete", setDoc, next);
    return true;
  }

  function removeNode(id) {
    if (!removeIds([id])) return;
    const remainingSelection = selection
      .getIds()
      .filter((selectedId) => findNode(getDoc(), selectedId));
    if (selection.selectNodes(remainingSelection)) {
      requestRender();
      notify();
    }
  }

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

  function reorderNode(id, direction) {
    return commitEditorDocument(
      "editor.layer.order",
      setDoc,
      ops.reorderNode(getDoc(), id, direction),
    );
  }

  function reorderNodeTo(id, index) {
    const doc = getDoc();
    const next = ops.reorderNodeTo(doc, id, index);
    if (next === doc) return;
    commitEditorDocument("editor.layer.order", setDoc, next);
  }

  function reorderNodes(ids, direction) {
    const doc = getDoc();
    const next = ops.reorderNodes(doc, ids, direction);
    if (next === doc) return;
    commitEditorDocument("editor.layer.order", setDoc, next);
  }

  function moveToFront(ids) {
    let next = getDoc();
    for (const id of ops.extremeOrder(next, ids, "front")) {
      next = ops.moveNodeToExtreme(next, id, "front");
    }
    if (next === getDoc()) return;
    commitEditorDocument("editor.layer.order", setDoc, next, {
      name: "editor.history.entry.bringToFront",
    });
  }

  function moveToBack(ids) {
    let next = getDoc();
    for (const id of ops.extremeOrder(next, ids, "back")) {
      next = ops.moveNodeToExtreme(next, id, "back");
    }
    if (next === getDoc()) return;
    commitEditorDocument("editor.layer.order", setDoc, next, {
      name: "editor.history.entry.sendToBack",
    });
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

  function moveNodeToRoot(id, targetRootIndex) {
    const doc = getDoc();
    const next = ops.moveNodeToRoot(doc, id, targetRootIndex);
    if (next === doc) return false;
    commitEditorDocument("editor.layer.move", setDoc, next, {
      name: "editor.history.entry.moveOutOfGroup",
    });
    return true;
  }

  function nodeAtPoint(point, options = {}) {
    // Hit testing must use the frame painted on the stage. A saved X/Y value
    // can be far from an animated node's visible position at the playhead.
    const doc = getDoc();
    const zoom = options.zoom ?? (typeof getZoom === "function" ? getZoom() : 1);
    return ops.nodeAtPoint(doc, point, {
      zoom,
      ...options,
      reject: (node, at) => {
        if (node.paint === true && !paintTools.api.isPaintOpaqueAt(node, at)) {
          return true;
        }
        if (node.kind === NODE_KIND.IMAGE) {
          const eff = getEffectiveNode?.(node);
          if (eff?.effectiveLocal) {
            const local = toNodeLocal(node, at);
            const el = eff.effectiveLocal;
            if (
              local.x < el.x ||
              local.x > el.x + el.width ||
              local.y < el.y ||
              local.y > el.y + el.height
            ) {
              return true;
            }
          }
        }
        return false;
      },
    });
  }

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

    const bottomIndex = Math.min(...selectedNodes.map((n) => doc.nodes.indexOf(n)));
    let nextNodes = doc.nodes.filter((n) => !selectedIds.includes(n.id));
    nextNodes.splice(bottomIndex, 0, result);

    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument(`editor.boolean.${op}`, setDoc, nextDoc);
    selection?.selectNodes?.([result.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  function typeOnSelectedPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    const pathNode = selectedIds
      .map((id) => findNode(doc, id))
      .find((n) => n && n.kind === NODE_KIND.PATH && (n.points?.length || n.anchors?.length));
    if (!pathNode || pathNode.locked || isLockedByGroup(doc, pathNode)) return false;

    const scaleX = pathNode.baseWidth ? pathNode.width / pathNode.baseWidth : 1;
    const scaleY = pathNode.baseHeight ? pathNode.height / pathNode.baseHeight : 1;
    const rawPoints = pathNode.points || pathNode.anchors || [];
    const docPoints = rawPoints.map((pt) => ({
      x: pathNode.x + pt.x * scaleX,
      y: pathNode.y + pt.y * scaleY,
      in: pt.in ? (Array.isArray(pt.in) ? [pt.in[0] * scaleX, pt.in[1] * scaleY] : { x: pt.in.x * scaleX, y: pt.in.y * scaleY }) : null,
      out: pt.out ? (Array.isArray(pt.out) ? [pt.out[0] * scaleX, pt.out[1] * scaleY] : { x: pt.out.x * scaleX, y: pt.out.y * scaleY }) : null,
      close: Boolean(pt.close),
    }));

    const textPath = {
      points: docPoints,
      closed: pathNode.closed || docPoints[docPoints.length - 1]?.close || false,
      startOffset: 0,
      align: "left",
      side: "top",
      reverse: false,
      baselineOffset: 0,
    };

    const textNode = {
      id: newId(),
      kind: NODE_KIND.TEXT,
      name: "Path Text",
      text: "Type along path...",
      fontSize: 22,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      fill: "#ffffff",
      textPath,
    };

    const layout = layoutTextOnPath(null, textNode);
    textNode.x = layout?.bounds?.x ?? pathNode.x;
    textNode.y = layout?.bounds?.y ?? pathNode.y;
    textNode.width = Math.max(20, layout?.bounds?.width ?? pathNode.width);
    textNode.height = Math.max(20, layout?.bounds?.height ?? pathNode.height);

    const pathIndex = doc.nodes.indexOf(pathNode);
    const nextNodes = [...doc.nodes];
    nextNodes.splice(pathIndex + 1, 0, textNode);

    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.create", setDoc, nextDoc);
    selection?.setIds?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  function attachTextToPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    if (selectedIds.length !== 2) return false;
    const nodes = selectedIds.map((id) => findNode(doc, id)).filter(Boolean);
    const textNode = nodes.find((n) => n.kind === NODE_KIND.TEXT);
    const pathNode = nodes.find((n) => n.kind === NODE_KIND.PATH && (n.points?.length || n.anchors?.length));
    if (!textNode || !pathNode) return false;
    if (textNode.locked || pathNode.locked || isLockedByGroup(doc, textNode) || isLockedByGroup(doc, pathNode)) return false;

    const scaleX = pathNode.baseWidth ? pathNode.width / pathNode.baseWidth : 1;
    const scaleY = pathNode.baseHeight ? pathNode.height / pathNode.baseHeight : 1;
    const rawPoints = pathNode.points || pathNode.anchors || [];
    const docPoints = rawPoints.map((pt) => ({
      x: pathNode.x + pt.x * scaleX,
      y: pathNode.y + pt.y * scaleY,
      in: pt.in ? (Array.isArray(pt.in) ? [pt.in[0] * scaleX, pt.in[1] * scaleY] : { x: pt.in.x * scaleX, y: pt.in.y * scaleY }) : null,
      out: pt.out ? (Array.isArray(pt.out) ? [pt.out[0] * scaleX, pt.out[1] * scaleY] : { x: pt.out.x * scaleX, y: pt.out.y * scaleY }) : null,
      close: Boolean(pt.close),
    }));

    const textPath = {
      points: docPoints,
      closed: pathNode.closed || docPoints[docPoints.length - 1]?.close || false,
      startOffset: 0,
      align: textNode.align || "left",
      side: "top",
      reverse: false,
      baselineOffset: 0,
    };

    const updatedText = {
      ...textNode,
      textPath,
    };
    const layout = layoutTextOnPath(null, updatedText);
    if (layout?.bounds) {
      updatedText.x = layout.bounds.x;
      updatedText.y = layout.bounds.y;
      updatedText.width = Math.max(20, layout.bounds.width);
      updatedText.height = Math.max(20, layout.bounds.height);
    }

    const nextNodes = doc.nodes.map((n) => (n.id === textNode.id ? updatedText : n));
    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.attach", setDoc, nextDoc);
    selection?.setIds?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  function detachTextFromPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    const textNode = selectedIds
      .map((id) => findNode(doc, id))
      .find((n) => n && n.kind === NODE_KIND.TEXT && n.textPath);
    if (!textNode || textNode.locked || isLockedByGroup(doc, textNode)) return false;

    const { textPath, ...rest } = textNode;
    const nextNodes = doc.nodes.map((n) => (n.id === textNode.id ? rest : n));
    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.detach", setDoc, nextDoc);
    selection?.setIds?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

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
    moveNodeBy,
    moveNodesBy,
    moveNodeToRoot,
    expandMoveSet: (ids) => ops.moveAffectedIds(getDoc(), ids),
    nodeAtPoint,
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
    typeOnSelectedPath,
    attachTextToPath,
    detachTextFromPath,
  };
}

import { findNode, isLockedByGroup, isContainerNode } from "./scene_model.js";
import { isFrameSelectionBoundary } from "./frame-selection-unit.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";

/** Lock the selected unit, rather than leaving locked children orphaned on deletion. */
function deletedSubtree(doc, ids) {
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const children = new Map();
  for (const node of doc.nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id); children.set(node.parentId, list);
  }
  const pending = ids.filter(id => {
    const node = byId.get(id);
    return node && !node.locked && !isLockedByGroup(doc, node);
  });
  const gone = new Set();
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    if (gone.has(id)) continue;
    gone.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  if (!gone.size) return gone;
  // Only ancestors emptied by this deletion are pruned; unrelated empty folders stay.
  const ancestors = new Set();
  for (const id of gone) {
    let parentId = byId.get(id)?.parentId;
    const seen = new Set();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId); ancestors.add(parentId); parentId = byId.get(parentId)?.parentId;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const occupied = new Set(doc.nodes.filter(n => !gone.has(n.id)).map(n => n.parentId));
    for (const id of ancestors) {
      const node = byId.get(id);
      if (gone.has(id) || !node || !isContainerNode(node) || isFrameSelectionBoundary(node) ||
        node.locked || isLockedByGroup(doc, node) || occupied.has(id)) continue;
      gone.add(id); changed = true;
    }
  }
  return gone;
}

export function createNodeStackActions({ getDoc, setDoc, selection, releaseNodeTextures,
  maskTools, paintTools, penTools, requestRender, notify }) {
  function removeIds(ids) {
    const doc = getDoc(), gone = deletedSubtree(doc, ids);
    if (!gone.size) return false;
    const nodes = doc.nodes.filter(node => !gone.has(node.id)).map(node => {
      if (!gone.has(node.clipTo)) return node;
      const { clipTo, ...released } = node;
      return released;
    });
    for (const id of gone) {
      releaseNodeTextures?.(findNode(doc, id));
      maskTools?.onNodeRemoved?.(id); paintTools?.onNodeRemoved?.(id); penTools?.onNodeRemoved?.(id);
    }
    commitEditorDocument("editor.layer.delete", setDoc, ops.withNodes(doc, nodes));
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

  function moveNodeToRoot(id, targetRootIndex) {
    const doc = getDoc();
    const next = ops.moveNodeToRoot(doc, id, targetRootIndex);
    if (next === doc) return false;
    commitEditorDocument("editor.layer.move", setDoc, next, {
      name: "editor.history.entry.moveOutOfGroup",
    });
    return true;
  }

  return { removeIds, removeNode, reorderNode, reorderNodeTo, reorderNodes, moveToFront, moveToBack, moveNodeToRoot };
}

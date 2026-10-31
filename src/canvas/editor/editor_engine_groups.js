/**
 * Hierarchy, grouping, clipping, boolean combination, and layout operations.
 *
 * Extracted from editor_engine.js to isolate container node manipulation.
 */

import {
  canCombine,
  createGroupNode,
  findNode,
  groupDescendants,
  isContainerNode,
  isLockedByGroup,
  NODE_KIND,
} from "./scene_model.js";
import { combinedBounds, nodeAABB } from "./scene_geometry.js";
import { isFrameNode } from "./prototype_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { groupingRoots } from "./group-structure.js";

export function createEngineGroups({
  getDoc,
  setDoc,
  selection,
  select,
  selectMany,
  unitSelectionIds,
  selectionUnits,
  clickUnitOf,
  getIsolationGroupId,
  setIsolationGroupId,
}) {
  function groupSelection() {
    const units = groupingRoots(getDoc(), selectionUnits().map(node => node.id));
    if (units.length < 2) return;
    const left = Math.min(...units.map((node) => node.x));
    const top = Math.min(...units.map((node) => node.y));
    const right = Math.max(...units.map((node) => node.x + node.width));
    const bottom = Math.max(...units.map((node) => node.y + node.height));
    const folder = createGroupNode({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
    commitEditorDocument(
      "editor.group.change",
      setDoc,
      ops.insertGroup(
        getDoc(),
        folder,
        units.map((node) => node.id),
      ),
    );
    select?.(folder.id);
  }

  function selectedContainerIds() {
    const doc = getDoc();
    const containerIds = new Set();
    for (const id of selection.getIds()) {
      const node = findNode(doc, id);
      if (!node || node.locked || isLockedByGroup(doc, node)) continue;
      // Loose Frame children are independent objects, not an implicit request
      // to dissolve their outermost Frame. Honor the current selection unit.
      const unit = isContainerNode(node) ? node : clickUnitOf(node);
      if (isContainerNode(unit) && !unit.locked && !isLockedByGroup(doc, unit)) containerIds.add(unit.id);
    }
    return containerIds;
  }

  function ungroupSelection() {
    const doc = getDoc();
    const containerIds = selectedContainerIds();
    if (containerIds.size === 0) return;
    const releasedIds = doc.nodes
      .filter(
        (node) =>
          node.parentId &&
          containerIds.has(node.parentId) &&
          !containerIds.has(node.id),
      )
      .map((node) => node.id);
    commitEditorDocument(
      "editor.group.change",
      setDoc,
      ops.ungroupNodes(doc, [...containerIds]),
    );
    if (releasedIds.length > 0) {
      selectMany(releasedIds);
    }
  }

  function createClippingMask() {
    const ids = selection.getIds();
    if (ids.length === 0) return false;
    const next = ops.createClippingMasks(getDoc(), ids);
    if (next === getDoc()) return false;
    commitEditorDocument("editor.clipping.change", setDoc, next);
    return true;
  }

  function releaseClippingMask() {
    const ids = selection.getIds();
    const next = ops.releaseClippingMasks(
      getDoc(),
      ids.length > 0 ? ids : null,
    );
    if (next === getDoc()) return false;
    commitEditorDocument("editor.clipping.change", setDoc, next);
    return true;
  }

  function clipNodeInto(sourceId, targetId) {
    const next = ops.clipNodeInto(getDoc(), sourceId, targetId);
    if (next === getDoc()) return false;
    commitEditorDocument("editor.clipping.change", setDoc, next);
    return true;
  }

  function enterGroup(nodeId) {
    const doc = getDoc();
    const node = findNode(doc, nodeId);
    if (!node) return false;
    const unit = clickUnitOf(node);
    if (!isContainerNode(unit)) return false;
    setIsolationGroupId(unit.id);
    select(nodeId);
    return true;
  }

  function exitGroup() {
    const isolationId = getIsolationGroupId();
    if (!isolationId) return false;
    const folder = findNode(getDoc(), isolationId);
    setIsolationGroupId(null);
    selectMany(unitSelectionIds(folder));
    return true;
  }

  function moveIntoGroup(id, groupId) {
    const doc = getDoc();
    const next = ops.moveIntoGroup(doc, id, groupId);
    if (next === doc) return false;
    commitEditorDocument("editor.group.change", setDoc, next);
    return true;
  }

  function reorderGroupTo(id, index) {
    const doc = getDoc();
    const next = ops.reorderGroupTo(doc, id, index);
    if (next === doc) return;
    commitEditorDocument("editor.layer.order", setDoc, next);
  }

  function combineSelected(operation) {
    const doc = getDoc();
    const selectedNodes = doc.nodes.filter((node) =>
      selection.isSelected(node.id),
    );
    if (
      selectedNodes.length === 1 &&
      selectedNodes[0].kind === NODE_KIND.BOOLEAN
    ) {
      commitEditorDocument(
        "editor.boolean.combine",
        setDoc,
        ops.updateNode(doc, selectedNodes[0].id, { operation }),
      );
      return;
    }
    const ids = selectedNodes.map((node) => node.id);
    const result = ops.combineNodes(doc, ids, operation);
    if (!result.id) return;
    commitEditorDocument("editor.boolean.combine", setDoc, result.doc);
    select(result.id);
  }

  function layoutSelection(layout, argument) {
    const doc = getDoc();
    const units = groupingRoots(
      doc,
      selectionUnits().map((node) => node.id),
    ).filter((unit) => !unit.lockPosition);
    if (units.length === 0) return;
    const measured = units.map((unit) => {
      // A Frame owns its explicit bounds; only a regular group derives its
      // alignment box from descendants. Its children still follow the delta.
      if (!isContainerNode(unit) || isFrameNode(unit)) return unit;
      const box = combinedBounds(
        groupDescendants(doc, unit.id)
          .filter((node) => !isContainerNode(node))
          .map((node) => nodeAABB(node)),
      );
      return box ? { ...unit, ...box, rotation: 0, shear: 0 } : unit;
    });
    // A single layer aligns inside its parent frame when it has one; otherwise
    // it aligns to the page. Multi-selection keeps the page bounds.
    const single = units.length === 1 ? units[0] : null;
    const parent = single?.parentId
      ? doc.nodes.find((node) => node.id === single.parentId)
      : null;
    const canvasBounds = parent
      ? { x: parent.x ?? 0, y: parent.y ?? 0, w: parent.width ?? 0, h: parent.height ?? 0 }
      : { x: 0, y: 0, w: doc.width, h: doc.height };
    const patches = layout(measured, argument, canvasBounds);
    if (!patches || patches.length === 0) return;
    let next = doc;
    for (const { id, patch } of patches) {
      const unit = measured.find((each) => each.id === id);
      const dx = (patch.x ?? unit.x) - unit.x;
      const dy = (patch.y ?? unit.y) - unit.y;
      if (dx === 0 && dy === 0) continue;
      const moved = ops.moveAffectedIds(doc, [id]);
      for (const memberId of moved) {
        const member = findNode(next, memberId);
        if (!member || member.locked || member.lockPosition || isLockedByGroup(next, member)) continue;
        next = ops.updateNode(next, memberId, {
          x: member.x + dx,
          y: member.y + dy,
        });
      }
    }
    if (next === doc) return;
    commitEditorDocument("editor.layout.selection", setDoc, next);
  }

  function toggleAutoLayoutSelection() {
    const doc = getDoc();
    const ids = selection.getIds();
    if (!ids || ids.length === 0) return;

    if (ids.length === 1) {
      const node = findNode(doc, ids[0]);
      if (!node) return;
      if (node.kind === NODE_KIND.GROUP || node.isFrame) {
        const nextLayout = node.autoLayout
          ? null
          : {
            direction: "vertical",
            gap: 8,
            padding: 0,
            alignItems: "start",
            justifyContent: "start",
            widthMode: "fixed",
            heightMode: "hug",
          };
        commitEditorDocument(
          "editor.autolayout.toggle",
          setDoc,
          ops.updateNode(doc, node.id, { autoLayout: nextLayout }),
        );
        return;
      }
    }

    const units = groupingRoots(getDoc(), selectionUnits().map(node => node.id));
    if (units.length === 0) return;

    const left = Math.min(...units.map((node) => node.x));
    const top = Math.min(...units.map((node) => node.y));
    const right = Math.max(...units.map((node) => node.x + node.width));
    const bottom = Math.max(...units.map((node) => node.y + node.height));

    const folder = createGroupNode({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      autoLayout: {
        direction: "horizontal",
        gap: 8,
        padding: 0,
        alignItems: "start",
        justifyContent: "start",
        widthMode: "hug",
        heightMode: "hug",
      },
    });

    const nextDoc = ops.insertGroup(
      doc,
      folder,
      units.map((node) => node.id),
    );
    commitEditorDocument("editor.autolayout.create", setDoc, nextDoc);
    select?.(folder.id);
  }

  return {
    groupSelection,
    ungroupSelection,
    toggleAutoLayoutSelection,
    createClippingMask,
    releaseClippingMask,
    clipNodeInto,
    hasClippedSelection: () =>
      selection
        .getIds()
        .some((id) => Boolean(findNode(getDoc(), id)?.clipTo)),
    canGroupSelection: () => {
      const units = selectionUnits();
      return units.length >= 2 && groupingRoots(getDoc(), units.map(node => node.id)).length >= 2;
    },
    canUngroupSelection: () => selectedContainerIds().size > 0,
    enterGroup,
    exitGroup,
    moveIntoGroup,
    reorderGroupTo,
    combineSelected,
    canCombineSelection: () => {
      const doc = getDoc();
      const selected = doc.nodes.filter((node) =>
        selection.isSelected(node.id),
      );
      if (selected.length === 1 && selected[0].kind === NODE_KIND.BOOLEAN) {
        return true;
      }
      return canCombine(selected);
    },
    layoutSelection,
  };
}

/**
 * Node selection, unit traversal, and hierarchy orchestration domain controller.
 *
 * Composes node CRUD operations, layer hierarchy & grouping, and layer provisioning.
 * Extracted from editor_engine.js.
 */

import {
  findNode,
  isGroupNode,
  isLockedByGroup,
} from "./scene_model.js";
import { frameSelectionUnit, isFrameSelectionBoundary } from "./frame-selection-unit.js";
import { groupArtworkIds } from "./layer_selection.js";
import { createEngineLayersController } from "./editor_engine_layers.js";
import { createFrequencySeparationController } from "./editor_frequency_separation.js";
import { createEngineNodeOps } from "./editor_engine_node_ops.js";
import { createEngineGroups } from "./editor_engine_groups.js";
import * as ops from "./doc_ops.js";

export function createEngineNodesController({
  getDoc,
  setDoc,
  selection,
  cache,
  maskTools,
  paintTools,
  penTools,
  releaseNodeTextures,
  getEffectiveNode,
  getPixelSelection,
  clearPixelSelection,
  setTool,
  requestRender,
  notify,
  onSelectionUnitChange,
}) {
  let isolationGroupId = null;
  let selectedGroupId = null;

  function setSelectedGroupId(id) {
    selectedGroupId = id;
    // Group identity can change while the selected leaf IDs remain identical.
    onSelectionUnitChange?.(id);
  }

  function clickUnitOf(node) {
    const doc = getDoc();
    if (isolationGroupId) {
      let current = node;
      const seen = new Set();
      while (current?.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        if (current.parentId === isolationGroupId) return current;
        current = findNode(doc, current.parentId);
      }
    }
    return frameSelectionUnit(doc, node);
  }

  function unitSelectionIds(unit) {
    if (!unit) return [];
    if (isFrameSelectionBoundary(unit) || !isGroupNode(unit)) return [unit.id];
    return groupArtworkIds(getDoc().nodes, unit.id);
  }

  function selectionUnits() {
    const doc = getDoc();
    const units = [];
    const seen = new Set();
    for (const id of selection.getIds()) {
      const node = findNode(doc, id);
      if (!node || node.locked || isLockedByGroup(doc, node)) continue;
      const unit = frameSelectionUnit(doc, node);
      if (!seen.has(unit.id)) {
        seen.add(unit.id);
        units.push(unit);
      }
    }
    return units;
  }

  function select(id) {
    if (!id) isolationGroupId = null;
    const node = id ? findNode(getDoc(), id) : null;
    const unit = node ? clickUnitOf(node) : null;
    const ids = unit ? unitSelectionIds(unit) : [];
    const nextGroupId = isGroupNode(unit) ? unit.id : null;
    const groupChanged = selectedGroupId !== nextGroupId;
    const selectionChanged = selection.selectNodes(ids);
    setSelectedGroupId(nextGroupId);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function selectMany(ids) {
    const groupChanged = selectedGroupId !== null;
    const selectionChanged = selection.selectNodes(ids);
    setSelectedGroupId(null);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function toggleSelect(id) {
    const node = id ? findNode(getDoc(), id) : null;
    if (!node) return;
    const unitIds = unitSelectionIds(clickUnitOf(node));
    const current = selection.getIds();
    const allIn = unitIds.every((each) => current.includes(each));
    const next = allIn
      ? current.filter((each) => !unitIds.includes(each))
      : [...current, ...unitIds.filter((each) => !current.includes(each))];
    const groupChanged = selectedGroupId !== null;
    const selectionChanged = selection.selectNodes(next);
    setSelectedGroupId(null);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function selectExactly(ids) {
    const groupChanged = selectedGroupId !== null;
    const selectionChanged = selection.selectNodes(ids ?? []);
    setSelectedGroupId(null);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function toggleExactly(id) {
    const groupChanged = selectedGroupId !== null;
    const selectionChanged = selection.toggleNode(id);
    setSelectedGroupId(null);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function selectBackground() {
    const groupChanged = selectedGroupId !== null;
    const selectionChanged = selection.selectBackground();
    setSelectedGroupId(null);
    if (!selectionChanged && !groupChanged) return;
    requestRender();
    notify();
  }

  function selectGroup(id) {
    const node = findNode(getDoc(), id);
    if (!isGroupNode(node)) return;
    isolationGroupId = null;
    const ids = unitSelectionIds(node);
    selection.selectNodes(ids);
    setSelectedGroupId(id);
    requestRender();
    notify();
  }

  function selectAll() {
    selectMany(
      getDoc()
        .nodes.filter(
          (node) =>
            node.visible !== false && !node.locked && !isGroupNode(node),
        )
        .map((node) => node.id),
    );
  }

  const nodeOps = createEngineNodeOps({
    getDoc, cache,
    setDoc,
    selection,
    releaseNodeTextures,
    maskTools,
    paintTools,
    penTools,
    getEffectiveNode,
    requestRender,
    notify,
  });

  const groups = createEngineGroups({
    getDoc,
    setDoc,
    selection,
    select,
    selectMany,
    unitSelectionIds,
    selectionUnits,
    clickUnitOf,
    getIsolationGroupId: () => isolationGroupId,
    setIsolationGroupId: (id) => {
      isolationGroupId = id;
    },
  });

  const layersController = createEngineLayersController({
    getDoc,
    setDoc,
    cache,
    selection,
    select,
    selectExactly,
    maskTools,
    paintTools,
    getPixelSelection,
    clearPixelSelection,
    setTool,
  });
  const frequencySeparationController = createFrequencySeparationController({
    getDoc,
    setDoc,
    cache,
    selectExactly,
  });

  return {
    select,
    selectMany,
    toggleSelect,
    selectExactly,
    toggleExactly,
    selectBackground,
    selectGroup,
    selectAll,
    selectWithin(rect, { add = null } = {}) {
      if (!rect) return;
      const hits = ops.nodesWithin(getDoc(), rect);
      selectMany([...(add ?? []), ...hits.map((node) => node.id)]);
    },
    clickUnitOf,
    unitSelectionIds,
    selectionUnits,

    getSelection: () => selection.get(),
    isSelected: (id) => selection.isSelected(id),
    isBackgroundSelected: () => selection.isBackground(),
    getSelectedId: () => selection.getId(),
    getSelectedIds: () => selection.getIds(),
    getSelected: () => {
      const id = selection.getId();
      const node = id ? findNode(getDoc(), id) : null;
      return node ? getEffectiveNode(node) : null;
    },
    getSelectedGroup: () => {
      const group = selectedGroupId
        ? findNode(getDoc(), selectedGroupId)
        : null;
      if (!isGroupNode(group)) return null;
      const expected = unitSelectionIds(group);
      const selectedIds = selection.getIds();
      return expected.length === selectedIds.length &&
        expected.every((id) => selectedIds.includes(id))
        ? getEffectiveNode(group)
        : null;
    },
    getSelectedNodes: () => {
      const ids = new Set(selection.getIds());
      const doc = getDoc();
      return ids.size === 0
        ? []
        : doc.nodes
            .filter((node) => ids.has(node.id))
            .map((node) => getEffectiveNode(node));
    },

    getIsolationGroupId: () => isolationGroupId,
    setIsolationGroupId: (id) => {
      isolationGroupId = id;
    },

    ...groups,
    ...nodeOps,
    ...layersController,
    ...frequencySeparationController,
  };
}

import { useRef, useState } from "react";
import { getCollapsedCanvasPageIds } from "./editor_canvas_selection.js";
import { getTreeSelectionSignature } from "./editor_canvas_tree_nav.js";
import { starterEffect, starterAdjustment } from "../editor/adjustment_catalog.js";
export default function useEditorLayersState(model) {
  const {
    activeCanvasId,
    initialCollapsedCanvasIds,
    selectedCanvasIds,
    canvasPages,
    selectedIds,
    isBackgroundSelected,
    activeIndex,
    objects,
    onFocusCanvas,
    onSelectCanvasLayer,
    initialSearch,
    onMutate,
    onCommit
  } = model;
  const listRef = useRef(null);
  const [renamingId, setRenamingId] = useState(null);
  const effectiveActiveCanvasId = activeCanvasId || "default";
  const [collapsedGroupIdsByCanvas, setCollapsedGroupIdsByCanvas] = useState(() => new Map());
  const collapsedIds = collapsedGroupIdsByCanvas.get(effectiveActiveCanvasId) ?? new Set();
  const [manualCollapsedCanvasIds, setManualCollapsedCanvasIds] = useState(() => new Set(initialCollapsedCanvasIds || []));
  const selectionDrivenCanvasRoots = Array.isArray(selectedCanvasIds);
  const collapsedCanvasIds = selectionDrivenCanvasRoots ? new Set(getCollapsedCanvasPageIds(canvasPages.map(page => page.id), selectedCanvasIds)) : manualCollapsedCanvasIds;
  const [focusedTreeKey, setFocusedTreeKey] = useState(null);
  const [focusedSelectionKey, setFocusedSelectionKey] = useState(null);
  const getSelectionKey = (canvasId = activeCanvasId || "default") => {
    return getTreeSelectionSignature({
      canvasId,
      selectedIds,
      isBackgroundSelected,
      activeLayerId: activeIndex >= 0 ? objects[activeIndex]?.id : null
    });
  };
  const focusTreeItem = (key, selectionKey = getSelectionKey()) => {
    setFocusedTreeKey(key);
    setFocusedSelectionKey(selectionKey);
  };
  const toggleCanvasCollapse = canvasId => {
    focusTreeItem(`canvas-${canvasId}`);
    if (selectionDrivenCanvasRoots) {
      // Root visibility follows engine selection; disclosure may select a
      // folded page but cannot expand an unselected page independently.
      if (!selectedCanvasIds.includes(canvasId)) onFocusCanvas?.(canvasId);
      return;
    }
    setManualCollapsedCanvasIds(previous => {
      const next = new Set(previous);
      if (next.has(canvasId)) next.delete(canvasId);else next.add(canvasId);
      return next;
    });
  };
  const handleCanvasRowFocus = canvasId => {
    focusTreeItem(`canvas-${canvasId}`, `${canvasId}:background`);
    onFocusCanvas?.(canvasId);
  };
  const handleSelectInactiveCanvasLayer = (canvasId, layerId) => {
    focusTreeItem(`inactive-layer-${canvasId}-${layerId}`, `${canvasId}:${layerId}`);
    onSelectCanvasLayer?.(canvasId, layerId);
  };
  const cancelRenameRef = useRef(false);
  const searchInputRef = useRef(null);
  const [showSearch, setShowSearch] = useState(Boolean(initialSearch));
  /** Live search query; the panel filters its own rows — no parent wiring. */
  const [search, setSearch] = useState(initialSearch || "");
  const query = search.trim().toLowerCase();
  const [panelTab, setPanelTab] = useState("layers");
  /** Which row's adjustment/effect editor popover is open, or null. */
  const [popover, setPopover] = useState(null); // { nodeId, kind, isEffect } — kind null = add picker
  const [newAdjustmentPicker, setNewAdjustmentPicker] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const [draggedChip, setDraggedChip] = useState(null); // { sourceNodeId, kind, isEffect }
  /** Right-click menu: { x, y, index, object } or null. */
  const [contextMenu, setContextMenu] = useState(null);
  const anchorIdRef = useRef(null);

  /** Moves an adjustment/effect from one node to another. */
  const transferKind = (sourceNodeId, targetNodeId, kind, isEffect) => {
    if (sourceNodeId === targetNodeId) return;
    const source = objects.find(obj => obj.id === sourceNodeId);
    const target = objects.find(obj => obj.id === targetNodeId);
    if (!source || !target) return;
    if (isEffect) {
      const payload = source.effects?.[kind] ?? starterEffect(kind);
      const nextSource = {
        ...(source.effects ?? {})
      };
      delete nextSource[kind];
      const nextTarget = {
        ...(target.effects ?? {}),
        [kind]: payload
      };
      onMutate?.(sourceNodeId, {
        effects: nextSource
      });
      onMutate?.(targetNodeId, {
        effects: nextTarget
      });
    } else {
      const payload = source.adjustments?.[kind] ?? starterAdjustment(kind);
      const nextSource = {
        ...(source.adjustments ?? {})
      };
      delete nextSource[kind];
      const nextTarget = {
        ...(target.adjustments ?? {}),
        [kind]: payload
      };
      onMutate?.(sourceNodeId, {
        adjustments: nextSource
      });
      onMutate?.(targetNodeId, {
        adjustments: nextTarget
      });
    }
    onCommit?.();
  };

  /** Adds a kind with its starter patch, then opens its editor. */
  const addKind = (nodeId, kind, isEffect) => {
    const node = objects.find(object => object.id === nodeId);
    if (!node) return;
    if (isEffect) {
      onMutate?.(nodeId, {
        effects: {
          ...(node.effects ?? {}),
          [kind]: starterEffect(kind)
        }
      });
    } else {
      onMutate?.(nodeId, {
        adjustments: {
          ...(node.adjustments ?? {}),
          [kind]: starterAdjustment(kind)
        }
      });
    }
    onCommit?.();
    setPopover({
      nodeId,
      kind,
      isEffect
    });
  };

  /** A preset is several adjustments at once; it merges, never replaces. */
  const applyPreset = (nodeId, preset) => {
    const node = objects.find(object => object.id === nodeId);
    if (!node) return;
    onMutate?.(nodeId, {
      adjustments: {
        ...(node.adjustments ?? {}),
        ...structuredClone(preset.adjustments)
      }
    });
    onCommit?.();
    setPopover(null);
  };
  const popoverNode = popover ? objects.find(object => object.id === popover.nodeId) : null;
  return {
    listRef,
    renamingId,
    setRenamingId,
    effectiveActiveCanvasId,
    collapsedGroupIdsByCanvas,
    setCollapsedGroupIdsByCanvas,
    collapsedIds,
    manualCollapsedCanvasIds,
    setManualCollapsedCanvasIds,
    selectionDrivenCanvasRoots,
    collapsedCanvasIds,
    focusedTreeKey,
    setFocusedTreeKey,
    focusedSelectionKey,
    setFocusedSelectionKey,
    getSelectionKey,
    focusTreeItem,
    toggleCanvasCollapse,
    handleCanvasRowFocus,
    handleSelectInactiveCanvasLayer,
    cancelRenameRef,
    searchInputRef,
    showSearch,
    setShowSearch,
    search,
    setSearch,
    query,
    panelTab,
    setPanelTab,
    popover,
    setPopover,
    newAdjustmentPicker,
    setNewAdjustmentPicker,
    hoveredRowId,
    setHoveredRowId,
    draggedChip,
    setDraggedChip,
    contextMenu,
    setContextMenu,
    anchorIdRef,
    transferKind,
    addKind,
    applyPreset,
    popoverNode
  };
}

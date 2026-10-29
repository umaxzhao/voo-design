import { resolveCurrentTreeKey, computeActiveDescendantId, getTreeSelectionSignature, handleTreeNavigationKeyDown } from "./editor_canvas_tree_nav.js";
import { useEffect } from "react";
import { usePropertyCommit } from "./editor_properties/use_property_commit.js";
import { isRowSelected } from "../editor/layer_selection.js";
import useLayerDrag from "./use_layer_drag.js";
import { isContainerNode, isGroupNode, isBooleanNode, groupDescendants } from "../editor/scene_model.js";
export default function useEditorLayerInteractions(model) {
  const {
    activeCanvasId,
    getSelectionKey,
    selectedIds,
    isBackgroundSelected,
    activeIndex,
    objects,
    focusedTreeKey,
    focusedSelectionKey,
    visibleTreeItems,
    listRef,
    activeObject,
    onMutate,
    onCommit,
    isolationGroupId,
    dragUnits,
    onMoveIntoGroup,
    onClipInto,
    onReorder,
    onMoveNodeToRoot,
    docIndexOf,
    onReorderGroup,
    setRenamingId,
    cancelRenameRef,
    onRename,
    effectiveActiveCanvasId,
    setCollapsedGroupIdsByCanvas,
    focusTreeItem,
    childrenMap,
    rows,
    onSelectExactly,
    onToggleSelect,
    anchorIdRef,
    onSelectGroup,
    onSelect,
    onFocusCanvas,
    onSelectCanvasLayer,
    onSelectBackground,
    toggleCanvasCollapse,
    onDeleteSelected,
    onRemove,
    setFocusedTreeKey
  } = model;
  const effectiveCanvasId = activeCanvasId || "default";
  const currentSelectionKey = getSelectionKey(effectiveCanvasId);
  const fallbackTreeKey = selectedIds.length === 1 ? `layer-${effectiveCanvasId}-${selectedIds[0]}` : isBackgroundSelected ? "canvas-background" : activeIndex >= 0 ? `layer-${effectiveCanvasId}-${objects[activeIndex]?.id}` : activeCanvasId ? `canvas-${activeCanvasId}` : null;
  const currentTreeKey = resolveCurrentTreeKey({
    focusedTreeKey,
    focusedSelectionKey,
    currentSelectionKey,
    fallbackTreeKey
  });
  const listActiveDescendantDomId = computeActiveDescendantId(visibleTreeItems, currentTreeKey);
  useEffect(() => {
    if (!listActiveDescendantDomId || typeof document === "undefined") return;
    const row = document.getElementById(listActiveDescendantDomId);
    if (row && listRef.current?.contains(row)) {
      row.scrollIntoView?.({
        block: "nearest"
      });
    }
  }, [listActiveDescendantDomId]);
  const {
    edit,
    editAndCommit,
    commitNow
  } = usePropertyCommit({
    onMutate: patch => activeObject && onMutate?.(activeObject.id, patch),
    onCommit
  });
  const blendModeLabelKey = mode => `editor.blend.${mode.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;

  /** Whether a row paints as selected; see layer_selection.js for the rule. */
  const rowSelectedOf = node => isRowSelected(objects, node, {
    selectedIds,
    activeIndex,
    isBackgroundSelected,
    isolationGroupId
  });
  const {
    dragId,
    slot,
    overId,
    beginRowDrag
  } = useLayerDrag({
    listRef,
    nodes: dragUnits,
    onDrop: (id, target, clipIntoId, scope) => {
      const dragged = objects.find(object => object.id === id);
      if (clipIntoId) {
        // Dropped on a row: a folder takes the layer in as a member, any
        // other layer clips it (Photoshop's two drag gestures, told apart by
        // the drop target). Re-dropping a member onto its own folder is a
        // no-op so the tree is never broken.
        if (dragged?.parentId && dragged.parentId === clipIntoId) return;
        const targetNode = objects.find(object => object.id === clipIntoId);
        if (targetNode && isContainerNode(targetNode)) {
          onMoveIntoGroup?.(id, clipIntoId);
        } else {
          onClipInto?.(id, clipIntoId);
        }
        return;
      }
      // A group member dropped on a root slot leaves its folder: the hook
      // passes the root-plane index straight through.
      if (dragged?.parentId && scope === "siblings") {
        const siblings = objects.filter(object => object.parentId === dragged.parentId);
        const siblingsWithoutDragged = siblings.filter(object => object.id !== id);
        const withoutDragged = objects.filter(object => object.id !== id);
        const siblingTarget = siblingsWithoutDragged[target];
        const targetIndex = siblingTarget ? withoutDragged.findIndex(object => object.id === siblingTarget.id) : withoutDragged.findIndex(object => object.id === siblingsWithoutDragged.at(-1)?.id) + 1;
        if (targetIndex >= 0) onReorder?.(id, targetIndex);
        return;
      }
      if (dragged?.parentId) {
        onMoveNodeToRoot?.(id, target);
        return;
      }
      const unit = dragUnits[target];
      const docTarget = unit ? docIndexOf.get(unit.id) : 0;
      if (isGroupNode(dragged) || isBooleanNode(dragged)) onReorderGroup?.(id, docTarget);else onReorder?.(id, docTarget);
    }
  });

  /** Enter/blur commits, Escape cancels; empty input clears the rename. */
  const commitRename = (index, raw) => {
    setRenamingId(null);
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    const trimmed = raw.trim().slice(0, 128);
    onRename?.(index, trimmed || null);
    requestAnimationFrame(() => {
      listRef.current?.focus?.();
    });
  };
  const toggleCollapsed = (id, canvasId = effectiveActiveCanvasId) => {
    setCollapsedGroupIdsByCanvas(current => {
      const next = new Map(current);
      const groupIds = new Set(next.get(canvasId) ?? []);
      if (groupIds.has(id)) groupIds.delete(id);else groupIds.add(id);
      next.set(canvasId, groupIds);
      return next;
    });
  };
  const toggleGroupCollapse = (groupId, canvasId = effectiveActiveCanvasId) => {
    toggleCollapsed(groupId, canvasId);
    focusTreeItem(canvasId === effectiveActiveCanvasId ? `layer-${canvasId}-${groupId}` : `inactive-layer-${canvasId}-${groupId}`);
  };
  const collectNodeIds = rowList => {
    const ids = [];
    for (const r of rowList) {
      if (isGroupNode(r.node) || isBooleanNode(r.node)) {
        const children = childrenMap.get(r.node.id) ?? [];
        for (const child of children) {
          if (!isGroupNode(child) && !isBooleanNode(child)) ids.push(child.id);
        }
      } else {
        ids.push(r.node.id);
      }
    }
    return ids;
  };
  const selectRangeBetween = (anchorId, targetId) => {
    const anchorRowIdx = anchorId ? rows.findIndex(r => r.node.id === anchorId) : -1;
    const targetRowIdx = rows.findIndex(r => r.node.id === targetId);
    if (anchorRowIdx >= 0 && targetRowIdx >= 0) {
      const start = Math.min(anchorRowIdx, targetRowIdx);
      const end = Math.max(anchorRowIdx, targetRowIdx);
      const rangeRows = rows.slice(start, end + 1);
      const ids = collectNodeIds(rangeRows);
      if (onSelectExactly) {
        onSelectExactly(ids);
      } else {
        for (const r of rangeRows) {
          onToggleSelect?.(r.index);
        }
      }
      return true;
    }
    return false;
  };
  const pickRow = (node, index, event) => {
    const rowKey = `layer-${effectiveActiveCanvasId}-${node.id}`;
    const exclusivePick = !event.shiftKey && !event.metaKey && !event.ctrlKey;
    // selectGroup currently ignores boolean nodes, so retain the current selection signature.
    focusTreeItem(rowKey, exclusivePick ? isGroupNode(node) ? getTreeSelectionSignature({
      canvasId: effectiveActiveCanvasId,
      selectedIds: groupDescendants({
        nodes: objects
      }, node.id).filter(descendant => !isGroupNode(descendant)).map(descendant => descendant.id)
    }) : isBooleanNode(node) ? getSelectionKey() : getTreeSelectionSignature({
      canvasId: effectiveActiveCanvasId,
      selectedIds: [node.id]
    }) : getSelectionKey());
    if ((isGroupNode(node) || isBooleanNode(node)) && exclusivePick) {
      anchorIdRef.current = node.id;
      onSelectGroup?.(node.id);
      return;
    }
    if (event.shiftKey) {
      const anchorId = anchorIdRef.current || (selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null) || (activeIndex >= 0 ? objects[activeIndex]?.id : null);
      if (selectRangeBetween(anchorId, node.id)) {
        return;
      }
    }
    anchorIdRef.current = node.id;
    if (event.metaKey || event.ctrlKey) {
      onToggleSelect?.(index);
    } else {
      onSelect(index);
    }
  };
  const handleListKeyDown = event => {
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable) {
      return;
    }
    if (event.target !== listRef.current && !listRef.current?.contains(event.target)) {
      return;
    }
    if (visibleTreeItems.length === 0) return;
    const res = handleTreeNavigationKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      items: visibleTreeItems,
      currentFocusedKey: currentTreeKey,
      anchorLayerId: anchorIdRef.current || (selectedIds.length > 0 ? selectedIds[0] : null) || (activeIndex >= 0 ? objects[activeIndex]?.id : null),
      activeCanvasId,
      callbacks: {
        onSelectCanvas: canvasId => {
          focusTreeItem(`canvas-${canvasId}`, `${canvasId}:background`);
          onFocusCanvas?.(canvasId);
        },
        onSelectLayer: index => {
          const row = visibleTreeItems.find(item => item.index === index && item.isActiveCanvas);
          if (row) {
            anchorIdRef.current = row.layerId;
            focusTreeItem(row.key, `${effectiveCanvasId}:${row.layerId}`);
          }
          onSelect(index);
        },
        onSelectCanvasLayer: (canvasId, layerId) => {
          focusTreeItem(`inactive-layer-${canvasId}-${layerId}`, `${canvasId}:${layerId}`);
          onSelectCanvasLayer?.(canvasId, layerId);
        },
        onSelectBackground: () => {
          focusTreeItem(`background-${effectiveCanvasId}`, `${effectiveCanvasId}:background`);
          onSelectBackground?.();
        },
        onSelectRange: (anchorId, targetId) => {
          selectRangeBetween(anchorId, targetId);
        },
        onToggleSelect: index => {
          onToggleSelect?.(index);
        },
        onToggleCanvasCollapse: canvasId => {
          toggleCanvasCollapse(canvasId);
        },
        onToggleGroupCollapse: (nodeId, canvasId) => {
          toggleGroupCollapse(nodeId, canvasId);
        },
        onStartRename: layerId => {
          cancelRenameRef.current = false;
          setRenamingId(layerId);
        },
        onDeleteSelected: () => {
          if (onDeleteSelected) onDeleteSelected();else if (activeIndex >= 0) onRemove(activeIndex);
        }
      }
    });
    if (res.handled) {
      event.preventDefault();
      if (res.nextFocusedKey) {
        setFocusedTreeKey(res.nextFocusedKey);
      }
    }
  };
  return {
    effectiveCanvasId,
    currentSelectionKey,
    fallbackTreeKey,
    currentTreeKey,
    listActiveDescendantDomId,
    edit,
    editAndCommit,
    commitNow,
    blendModeLabelKey,
    rowSelectedOf,
    dragId,
    slot,
    overId,
    beginRowDrag,
    commitRename,
    toggleCollapsed,
    toggleGroupCollapse,
    collectNodeIds,
    selectRangeBetween,
    pickRow,
    handleListKeyDown
  };
}

import { wouldCreateCanvasCycle } from "../editor/canvas-instance-graph.js";

export function getTreeSelectionSignature({
  canvasId,
  selectedIds = [],
  isBackgroundSelected = false,
  activeLayerId = null,
}) {
  const selection = isBackgroundSelected
    ? "background"
    : selectedIds.length > 0
      ? [...selectedIds].sort().join(",")
      : activeLayerId || "none";
  return `${canvasId}:${selection}`;
}

/** Resolves row focus against the selection snapshot taken when the tree focused it. */
export function resolveCurrentTreeKey({
  focusedTreeKey,
  focusedSelectionKey,
  currentSelectionKey,
  fallbackTreeKey,
}) {
  if (focusedTreeKey && focusedSelectionKey === currentSelectionKey) {
    return focusedTreeKey;
  }
  return fallbackTreeKey || null;
}

/** Returns the localized error key when an insert would create a canvas cycle. */
export function getCanvasInsertErrorKey(targetId, sourceId, resolveCanvas) {
  return wouldCreateCanvasCycle(targetId, sourceId, resolveCanvas)
    ? "editor.instance.cycleInsertBlocked"
    : null;
}

/**
 * Checks whether a group should be expanded in search.
 * When searching, if any descendant matches, the group is temporarily expanded.
 * Clearing search restores the user's persisted collapsedIds.
 */
export function isGroupExpandedInSearch(
  groupNode,
  collapsedIds,
  query,
  childrenMap,
  subtreeMatchesFn,
) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return !collapsedIds.has(groupNode.id);
  }
  const children = childrenMap.get(groupNode.id) ?? [];
  const hasMatchingDescendant = children.some((child) =>
    subtreeMatchesFn ? subtreeMatchesFn(child) : false,
  );
  if (hasMatchingDescendant) {
    return true;
  }
  return !collapsedIds.has(groupNode.id);
}

/**
 * Computes aria-activedescendant DOM id from the visible items list.
 * Only returns a DOM id if the item is currently visible in the DOM.
 */
export function computeActiveDescendantId(items = [], focusedKey = null) {
  if (!focusedKey || items.length === 0) return undefined;
  const match = items.find(
    (item) =>
      item.key === focusedKey ||
      item.domId === focusedKey ||
      item.layerId === focusedKey ||
      item.canvasId === focusedKey ||
      (item.isActiveCanvas && focusedKey.endsWith(`-${item.layerId}`)),
  );
  return match ? match.domId : undefined;
}

/**
 * Handles keyboard events on the unified tree listbox (ArrowUp/Down, Left/Right, Enter, Space, Delete).
 */
export function handleTreeNavigationKeyDown({
  key,
  shiftKey = false,
  items = [],
  currentFocusedKey = null,
  anchorLayerId = null,
  activeCanvasId = null,
  callbacks = {},
}) {
  if (items.length === 0)
    return { handled: false, nextFocusedKey: currentFocusedKey };

  const currentIndex = items.findIndex(
    (item) =>
      item.key === currentFocusedKey ||
      item.domId === currentFocusedKey ||
      item.layerId === currentFocusedKey ||
      item.canvasId === currentFocusedKey ||
      (currentFocusedKey &&
        item.layerId &&
        currentFocusedKey.endsWith(`-${item.layerId}`)),
  );

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;

  if (key === "ArrowDown" || key === "ArrowUp") {
    const step = key === "ArrowDown" ? 1 : -1;
    const start =
      currentIndex < 0 ? (step === 1 ? -1 : items.length) : currentIndex;
    const nextIndex = start + step;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return { handled: true, nextFocusedKey: currentFocusedKey };
    }

    const nextItem = items[nextIndex];

    if (shiftKey) {
      // Shift multi-select must NOT cross document boundaries
      // Can only multi-select layers within the currently active canvas
      const currentCanvas = currentItem?.canvasId || activeCanvasId;
      if (
        nextItem.type !== "layer" ||
        nextItem.canvasId !== currentCanvas ||
        nextItem.canvasId !== activeCanvasId
      ) {
        // Block multi-select from crossing canvas boundaries
        return { handled: true, nextFocusedKey: currentFocusedKey };
      }

      if (callbacks.onSelectRange && anchorLayerId) {
        callbacks.onSelectRange(anchorLayerId, nextItem.layerId);
      } else if (callbacks.onToggleSelect && nextItem.index != null) {
        callbacks.onToggleSelect(nextItem.index);
      }
      return { handled: true, nextFocusedKey: nextItem.key };
    }

    // Normal Arrow navigation
    if (nextItem.type === "canvas") {
      callbacks.onSelectCanvas?.(nextItem.canvasId);
    } else if (nextItem.type === "layer") {
      callbacks.onSelectLayer?.(nextItem.index);
    } else if (nextItem.type === "inactive-layer") {
      callbacks.onSelectCanvasLayer?.(nextItem.canvasId, nextItem.layerId);
    } else if (nextItem.type === "background") {
      callbacks.onSelectBackground?.();
    }

    return { handled: true, nextFocusedKey: nextItem.key };
  }

  if (key === "ArrowRight") {
    if (!currentItem)
      return { handled: false, nextFocusedKey: currentFocusedKey };

    if (currentItem.type === "canvas") {
      if (!currentItem.isExpanded) {
        callbacks.onToggleCanvasCollapse?.(currentItem.canvasId);
        return { handled: true, nextFocusedKey: currentItem.key };
      }
      // If already expanded, move to first child
      if (
        currentIndex + 1 < items.length &&
        items[currentIndex + 1].canvasId === currentItem.canvasId
      ) {
        const nextItem = items[currentIndex + 1];
        if (nextItem.type === "layer")
          callbacks.onSelectLayer?.(nextItem.index);
        else if (nextItem.type === "inactive-layer")
          callbacks.onSelectCanvasLayer?.(nextItem.canvasId, nextItem.layerId);
        return { handled: true, nextFocusedKey: nextItem.key };
      }
    } else if (
      (currentItem.type === "layer" || currentItem.type === "inactive-layer") &&
      currentItem.isGroup
    ) {
      if (!currentItem.isExpanded) {
        callbacks.onToggleGroupCollapse?.(
          currentItem.layerId,
          currentItem.canvasId,
        );
        return { handled: true, nextFocusedKey: currentItem.key };
      }
      const nextItem = items[currentIndex + 1];
      if (
        nextItem?.canvasId === currentItem.canvasId &&
        nextItem.depth > currentItem.depth
      ) {
        if (nextItem.type === "layer")
          callbacks.onSelectLayer?.(nextItem.index);
        else if (nextItem.type === "inactive-layer") {
          callbacks.onSelectCanvasLayer?.(nextItem.canvasId, nextItem.layerId);
        }
        return { handled: true, nextFocusedKey: nextItem.key };
      }
    }
  }

  if (key === "ArrowLeft") {
    if (!currentItem)
      return { handled: false, nextFocusedKey: currentFocusedKey };

    if (currentItem.type === "canvas") {
      if (currentItem.isExpanded) {
        callbacks.onToggleCanvasCollapse?.(currentItem.canvasId);
        return { handled: true, nextFocusedKey: currentItem.key };
      }
    } else if (
      currentItem.type === "layer" ||
      currentItem.type === "inactive-layer"
    ) {
      if (currentItem.isGroup && currentItem.isExpanded) {
        callbacks.onToggleGroupCollapse?.(
          currentItem.layerId,
          currentItem.canvasId,
        );
        return { handled: true, nextFocusedKey: currentItem.key };
      }
      if (currentItem.parentId) {
        // Move to parent group
        const parentGroup = items.find(
          (item) =>
            item.canvasId === currentItem.canvasId &&
            item.layerId === currentItem.parentId,
        );
        if (parentGroup) {
          if (parentGroup.type === "layer")
            callbacks.onSelectLayer?.(parentGroup.index);
          else
            callbacks.onSelectCanvasLayer?.(
              parentGroup.canvasId,
              parentGroup.layerId,
            );
          return { handled: true, nextFocusedKey: parentGroup.key };
        }
      }
      // Move to parent canvas
      const parentCanvas = items.find(
        (item) =>
          item.type === "canvas" && item.canvasId === currentItem.canvasId,
      );
      if (parentCanvas) {
        callbacks.onSelectCanvas?.(parentCanvas.canvasId);
        return { handled: true, nextFocusedKey: parentCanvas.key };
      }
    } else if (
      currentItem.type === "inactive-layer" ||
      currentItem.type === "background"
    ) {
      const parentCanvas = items.find(
        (item) =>
          item.type === "canvas" && item.canvasId === currentItem.canvasId,
      );
      if (parentCanvas) {
        callbacks.onSelectCanvas?.(parentCanvas.canvasId);
        return { handled: true, nextFocusedKey: parentCanvas.key };
      }
    }
  }

  if (key === "Enter") {
    if (!currentItem)
      return { handled: false, nextFocusedKey: currentFocusedKey };
    if (currentItem.type === "layer") {
      callbacks.onStartRename?.(currentItem.layerId);
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "canvas") {
      callbacks.onSelectCanvas?.(currentItem.canvasId);
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "inactive-layer") {
      callbacks.onSelectCanvasLayer?.(
        currentItem.canvasId,
        currentItem.layerId,
      );
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "background") {
      callbacks.onSelectBackground?.();
      return { handled: true, nextFocusedKey: currentItem.key };
    }
  }

  if (key === " ") {
    if (!currentItem)
      return { handled: false, nextFocusedKey: currentFocusedKey };
    if (currentItem.type === "canvas") {
      callbacks.onSelectCanvas?.(currentItem.canvasId);
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "layer") {
      callbacks.onSelectLayer?.(currentItem.index);
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "inactive-layer") {
      callbacks.onSelectCanvasLayer?.(
        currentItem.canvasId,
        currentItem.layerId,
      );
      return { handled: true, nextFocusedKey: currentItem.key };
    }
    if (currentItem.type === "background") {
      callbacks.onSelectBackground?.();
      return { handled: true, nextFocusedKey: currentItem.key };
    }
  }

  if (key === "Delete" || key === "Backspace") {
    if (currentItem?.type === "layer" && callbacks.onDeleteSelected) {
      callbacks.onDeleteSelected();
      return { handled: true, nextFocusedKey: currentFocusedKey };
    }
  }

  return { handled: false, nextFocusedKey: currentFocusedKey };
}

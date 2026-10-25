import PropTypes from "prop-types";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconChevronDown,
  IconChevronRight,
  IconClipMask,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconFrame,
  IconLock,
  IconMask,
  IconMove,
  IconPaint,
  IconRefresh,
  IconSearch,
  IconSwap,
  IconTransparency,
  IconOpacity,
  IconTrash,
  IconUnlock,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";
import { BLEND_MODES, DEFAULT_BLEND_MODE } from "../editor/scene_model_core.js";
import {
  canConvertToPath,
  convertShapeToPathNode,
  describeNode,
  groupDescendants,
  isContainerNode,
  isGroupNode,
  isBooleanNode,
} from "../editor/scene_model.js";
import { isRowSelected } from "../editor/layer_selection.js";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";
import EditorLayerThumb, { MaskThumb } from "./editor_layer_thumb.jsx";
import { OperationIcon } from "./editor_properties/combine_section.jsx";
import FlatSelect from "./flat_select.jsx";
import AdjustmentPopover from "./editor_properties/adjustment_popover.jsx";
import AddKindPicker from "./editor_properties/add_kind_picker.jsx";
import {
  starterAdjustment,
  starterEffect,
} from "../editor/adjustment_catalog.js";
import useLayerDrag from "./use_layer_drag.js";
import ScrubField from "./scrub_field.jsx";
import { usePropertyCommit } from "./editor_properties/use_property_commit.js";
import { isAssetFailed, retryAssetLoad } from "../editor/bitmap_cache.js";
import EditorInstanceChildRows from "./editor_instance_child_rows.jsx";
import { sourceLayerRows } from "./editor-instance-layer-model.js";
import EditorCanvasTreeRow from "./editor_canvas_tree_row.jsx";
import EditorCanvasInactiveLayers from "./editor_canvas_inactive_layers.jsx";
import { getCollapsedCanvasPageIds } from "./editor_canvas_selection.js";
import { checkCanvasMatch } from "./editor_canvas_tree_model.js";
import {
  handleTreeNavigationKeyDown,
  computeActiveDescendantId,
  isGroupExpandedInSearch,
  getTreeSelectionSignature,
  resolveCurrentTreeKey,
} from "./editor_canvas_tree_nav.js";
import { buildVisibleTreeItems } from "./editor_canvas_tree_items.js";
import { LAYERS_PANEL_MAX_HEIGHT_CLASS } from "./editor_panel_clearance.js";

const RASTERIZABLE_NODE_KINDS = new Set([
  "image",
  "text",
  "rect",
  "ellipse",
  "path",
  "boolean",
  "group",
]);

/**
 * Test-only render counter (§3.2).
 *
 * A re-render that produces identical output writes no DOM, so a MutationObserver
 * cannot see the layer panel re-rendering — the render count is the only
 * observable for the "idle hover must not re-render the tree" contract, and it
 * is what `scripts/verify-layer-hover-mutations.mjs` asserts. Null unless the
 * harness opted in under ?voo-test=1, so normal runs pay one property read.
 */
const LAYER_PANEL_RENDER_COUNTER =
  typeof window !== "undefined" &&
  window.location?.search?.includes("voo-test=1")
    ? "__vooTestLayerPanelRenders"
    : null;

/**
 * Keyboard handler for layer inline renaming.
 * Guards CJK IME composition so Enter/Escape does not commit prematurely or abort.
 */
export function handleLayerRenameKeyDown(event, cancelRenameRef) {
  if (
    event.nativeEvent?.isComposing ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }
  if (event.key === "Enter") {
    event.currentTarget?.blur();
    return true;
  }
  if (event.key === "Escape") {
    if (cancelRenameRef) cancelRenameRef.current = true;
    event.currentTarget?.blur();
    return true;
  }
  return false;
}

/**
 * Reload affordance for a layer whose asset went 404/empty: the canvas shows
 * a placeholder through the bitmap cache, and this button re-runs the load
 * after the user frees storage or restores the file. Hidden once the asset
 * decodes again (the placeholder leaves the cache on success).
 */
function LayerAssetReload({ assetKey }) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);
  if (!retrying && !isAssetFailed(assetKey)) return null;
  return (
    <button
      type="button"
      data-no-drag
      disabled={retrying}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setRetrying(true);
        void retryAssetLoad(assetKey).finally(() => setRetrying(false));
      }}
      title={t("editor.assets.reloadAsset")}
      aria-label={t("editor.assets.reloadAsset")}
      className="flex h-7 w-4 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5"
    >
      <IconRefresh
        size={11}
        className={retrying ? "animate-spin" : undefined}
      />
    </button>
  );
}

LayerAssetReload.propTypes = {
  assetKey: PropTypes.string.isRequired,
};

/**
 * The floating layers card.
 *
 * Hidden by default and toggled from the top-right control cluster. The
 * document's node list is bottom-up, so it is reversed here: the topmost
 * layer belongs at the top of the list, the way every image editor shows it.
 *
 * Groups render as folders with their members indented underneath and a
 * chevron to collapse them — Photoshop's tree. Membership is `parentId` on
 * the child; the folder row itself is a document node that never paints.
 *
 * Rows reorder by pointer drag with an insertion line, Photoshop-style, and
 * double-clicking a label renames the layer inline. Folder members reorder
 * among siblings or leave the folder when dropped on a root slot.
 */
export default function EditorLayers({
  objects,
  bottomInset = 0,
  activeIndex = -1,
  backgroundColor = "#262626",
  selectedIds = [],
  isBackgroundSelected = false,
  isolationGroupId = null,
  onSelect,
  onToggleSelect,
  onSelectExactly = null,
  onSelectBackground = () => {},
  onSelectGroup = () => {},
  onToggle,
  onToggleLock = () => {},
  onToggleLockTransparency = () => {},
  onToggleLockPosition = () => {},
  onToggleLockImagePixels = () => {},
  onReorder = null,
  onReorderGroup = null,
  onRemove,
  onRemoveMask = null,
  onDeleteSelected = null,
  onRename = null,
  onLayerToFront = () => {},
  onLayerToBack = () => {},
  onRasterize = null,
  onConvertToPath = null,
  onDuplicateLayer = () => {},
  onMutate,
  onCommit,
  getBitmap = null,
  getNodeMask = null,
  maskEdit = null,
  onBeginMaskEdit = null,
  onEndMaskEdit = null,
  swapSide = false,
  onToggleSide = null,
  onAddAdjustmentLayer = null,
  onAddLayer = null,
  onAddMask = null,
  onGroupSelected = null,
  canGroupSelected = false,
  onCombineSelected = null,
  canCombineSelected = false,
  onClipInto = null,
  onMoveIntoGroup = null,
  onMoveNodeToRoot = null,
  canvasPages = [],
  selectedCanvasIds = null,
  activeCanvasId = null,
  onFocusCanvas = null,
  onSelectCanvasLayer = null,
  onOpenCanvasInstance = null,
  resolveCanvas = null,
  selectedInstanceChild = null,
  onSelectInstanceChild = null,
  initialCollapsedCanvasIds = null,
  initialSearch = "",
}) {
  if (LAYER_PANEL_RENDER_COUNTER) {
    window[LAYER_PANEL_RENDER_COUNTER] =
      (window[LAYER_PANEL_RENDER_COUNTER] ?? 0) + 1;
  }
  const { t } = useI18n();
  const sideClass = swapSide ? "right-4" : "left-4";
  const labels = {
    text: t("editor.layer.text"),
    brush: t("editor.layer.brush"),
    pen: t("editor.layer.vector"),
    rect: t("editor.layer.rect"),
    ellipse: t("editor.layer.ellipse"),
    image: t("editor.layer.image"),
    audio: t("editor.layer.audio"),
    region: t("editor.layer.region"),
    layer: t("editor.layer.generic"),
    group: t("editor.layer.group"),
    frame: t("editor.layer.frame") || "Frame",
    adjustment: t("editor.layer.adjustment"),
    arrow: t("editor.tool.arrow"),
    line: t("editor.tool.line"),
    polygon: t("editor.shape.polygon"),
    star: t("editor.shape.star"),
    canvasInstance: t("editor.instance.label"),
    mesh3d: t("editor.three.object"),
    "combine.union": t("editor.props.combine.union"),
    "combine.subtract": t("editor.props.combine.subtract"),
    "combine.intersect": t("editor.props.combine.intersect"),
    "combine.exclude": t("editor.props.combine.exclude"),
  };
  const listRef = useRef(null);
  const [renamingId, setRenamingId] = useState(null);
  const effectiveActiveCanvasId = activeCanvasId || "default";
  const [collapsedGroupIdsByCanvas, setCollapsedGroupIdsByCanvas] = useState(
    () => new Map(),
  );
  const collapsedIds =
    collapsedGroupIdsByCanvas.get(effectiveActiveCanvasId) ?? new Set();
  const [manualCollapsedCanvasIds, setManualCollapsedCanvasIds] = useState(
    () => new Set(initialCollapsedCanvasIds || []),
  );
  const selectionDrivenCanvasRoots = Array.isArray(selectedCanvasIds);
  const collapsedCanvasIds = selectionDrivenCanvasRoots
    ? new Set(
        getCollapsedCanvasPageIds(
          canvasPages.map((page) => page.id),
          selectedCanvasIds,
        ),
      )
    : manualCollapsedCanvasIds;
  const [focusedTreeKey, setFocusedTreeKey] = useState(null);
  const [focusedSelectionKey, setFocusedSelectionKey] = useState(null);
  const getSelectionKey = (canvasId = activeCanvasId || "default") => {
    return getTreeSelectionSignature({
      canvasId,
      selectedIds,
      isBackgroundSelected,
      activeLayerId: activeIndex >= 0 ? objects[activeIndex]?.id : null,
    });
  };
  const focusTreeItem = (key, selectionKey = getSelectionKey()) => {
    setFocusedTreeKey(key);
    setFocusedSelectionKey(selectionKey);
  };
  const toggleCanvasCollapse = (canvasId) => {
    focusTreeItem(`canvas-${canvasId}`);
    if (selectionDrivenCanvasRoots) {
      // Root visibility follows engine selection; disclosure may select a
      // folded page but cannot expand an unselected page independently.
      if (!selectedCanvasIds.includes(canvasId)) onFocusCanvas?.(canvasId);
      return;
    }
    setManualCollapsedCanvasIds((previous) => {
      const next = new Set(previous);
      if (next.has(canvasId)) next.delete(canvasId);
      else next.add(canvasId);
      return next;
    });
  };
  const handleCanvasRowFocus = (canvasId) => {
    focusTreeItem(`canvas-${canvasId}`, `${canvasId}:background`);
    onFocusCanvas?.(canvasId);
  };
  const handleSelectInactiveCanvasLayer = (canvasId, layerId) => {
    focusTreeItem(
      `inactive-layer-${canvasId}-${layerId}`,
      `${canvasId}:${layerId}`,
    );
    onSelectCanvasLayer?.(canvasId, layerId);
  };
  const cancelRenameRef = useRef(false);
  const searchInputRef = useRef(null);
  const [showSearch, setShowSearch] = useState(Boolean(initialSearch));
  /** Live search query; the panel filters its own rows — no parent wiring. */
  const [search, setSearch] = useState(initialSearch || "");
  const query = search.trim().toLowerCase();
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
    const source = objects.find((obj) => obj.id === sourceNodeId);
    const target = objects.find((obj) => obj.id === targetNodeId);
    if (!source || !target) return;

    if (isEffect) {
      const payload = source.effects?.[kind] ?? starterEffect(kind);
      const nextSource = { ...(source.effects ?? {}) };
      delete nextSource[kind];
      const nextTarget = { ...(target.effects ?? {}), [kind]: payload };
      onMutate?.(sourceNodeId, { effects: nextSource });
      onMutate?.(targetNodeId, { effects: nextTarget });
    } else {
      const payload = source.adjustments?.[kind] ?? starterAdjustment(kind);
      const nextSource = { ...(source.adjustments ?? {}) };
      delete nextSource[kind];
      const nextTarget = { ...(target.adjustments ?? {}), [kind]: payload };
      onMutate?.(sourceNodeId, { adjustments: nextSource });
      onMutate?.(targetNodeId, { adjustments: nextTarget });
    }
    onCommit?.();
  };

  /** Adds a kind with its starter patch, then opens its editor. */
  const addKind = (nodeId, kind, isEffect) => {
    const node = objects.find((object) => object.id === nodeId);
    if (!node) return;
    if (isEffect) {
      onMutate?.(nodeId, {
        effects: { ...(node.effects ?? {}), [kind]: starterEffect(kind) },
      });
    } else {
      onMutate?.(nodeId, {
        adjustments: {
          ...(node.adjustments ?? {}),
          [kind]: starterAdjustment(kind),
        },
      });
    }
    onCommit?.();
    setPopover({ nodeId, kind, isEffect });
  };

  /** A preset is several adjustments at once; it merges, never replaces. */
  const applyPreset = (nodeId, preset) => {
    const node = objects.find((object) => object.id === nodeId);
    if (!node) return;
    onMutate?.(nodeId, {
      adjustments: {
        ...(node.adjustments ?? {}),
        ...structuredClone(preset.adjustments),
      },
    });
    onCommit?.();
    setPopover(null);
  };

  const popoverNode = popover
    ? objects.find((object) => object.id === popover.nodeId)
    : null;

  /** Flat doc index by id — the handlers the parent passed are index-based. */
  const docIndexOf = new Map(
    objects.map((object, index) => [object.id, index]),
  );
  const panelObjects = objects;
  /** parentId → child nodes, in document (paint) order. */
  const childrenMap = new Map();
  for (const object of panelObjects) {
    if (!object.parentId) continue;
    if (!childrenMap.has(object.parentId)) childrenMap.set(object.parentId, []);
    childrenMap.get(object.parentId).push(object);
  }
  /** Top-level rows: root nodes plus the folders, in document order. */
  const units = panelObjects.filter((object) => !object.parentId);
  /** clipTo target id → its clipped members, in document (paint) order. */
  const clipMap = new Map();
  for (const object of panelObjects) {
    if (!object.clipTo) continue;
    if (!clipMap.has(object.clipTo)) clipMap.set(object.clipTo, []);
    clipMap.get(object.clipTo).push(object);
  }

  const activePage = canvasPages?.find((p) => p.id === activeCanvasId);
  const activeCanvasTitleMatches = Boolean(
    query && activePage && activePage.title?.toLowerCase().includes(query),
  );

  /**
   * Search/filter. A row matches when its displayed label — the node's
   * `name`, or the `describeNode` fallback — contains the query. A group or
   * clip base that has a matching descendant stays visible, so a hit inside
   * a folder or clip chain stays reachable in context.
   */
  const rowMatches = (node) => {
    if (!query || activeCanvasTitleMatches) return true;
    const label = describeNode(node, docIndexOf.get(node.id) ?? 0, labels);
    return label.toLowerCase().includes(query);
  };
  const subtreeMatches = (node) => {
    if (activeCanvasTitleMatches) return true;
    if (rowMatches(node)) return true;
    if (node.kind === "canvasInstance" && resolveCanvas) {
      const sourceDoc = resolveCanvas(node.sourceCanvasId);
      if (
        sourceLayerRows(
          sourceDoc,
          (child, index) => describeNode(child, index, labels),
          query,
        ).length > 0
      )
        return true;
    }
    for (const kid of childrenMap.get(node.id) ?? []) {
      if (subtreeMatches(kid)) return true;
    }
    for (const member of clipMap.get(node.id) ?? []) {
      if (subtreeMatches(member)) return true;
    }
    return false;
  };

  /**
   * The rows on display, top first. A folder's members follow it indented
   * unless it is collapsed; a clipping chain's members follow their base
   * indented one level, so a layer dragged into another reads as that
   * layer's child beneath it. `position` numbers only the top-level rows —
   * the drag math runs on those alone.
   */
  const rows = [];
  let topPosition = 0;
  const pushRow = (node, depth, siblingPosition = -1) => {
    // A filtered-out row drops from both display and drag math; ancestors of
    // a match stay so the tree reads coherently.
    if (query && !subtreeMatches(node)) return;
    rows.push({
      node,
      index: docIndexOf.get(node.id),
      depth,
      position: depth === 0 ? topPosition : siblingPosition,
    });
    if (depth === 0) topPosition += 1;
    const isGroup = isGroupNode(node) || isBooleanNode(node);
    const groupExpanded =
      isGroup &&
      isGroupExpandedInSearch(
        node,
        collapsedIds,
        query,
        childrenMap,
        subtreeMatches,
      );
    if (groupExpanded) {
      const children = childrenMap.get(node.id) ?? [];
      for (let i = children.length - 1; i >= 0; i -= 1)
        pushRow(children[i], depth + 1, children.length - i - 1);
    }
    const clips = clipMap.get(node.id);
    if (clips) {
      for (const member of clips) pushRow(member, depth + 1);
    }
  };
  /**
   * Top-level rows that are not themselves clipped: a clipped row renders
   * beneath its base and never joins the top-level drag math. Filtering
   * prunes the same list, so drag positions stay in sync with the rows on
   * screen.
   */
  const dragUnits = units.filter(
    (unit) => !unit.clipTo && (!query || subtreeMatches(unit)),
  );
  for (let i = dragUnits.length - 1; i >= 0; i -= 1) pushRow(dragUnits[i], 0);

  /** The background pseudo-row matches when its label or shown colour does. */
  const backgroundLabel = t("editor.layer.canvasBackground") || t("editor.layer.background");
  // A transparent page says so; a stand-in colour would read as applied.
  const backgroundTransparent =
    !backgroundColor || backgroundColor === "transparent";
  const displayBg = backgroundTransparent
    ? t("editor.layer.transparent")
    : backgroundColor;
  const backgroundText = `${backgroundLabel} ${displayBg}`.toLowerCase();
  const backgroundMatches = !query || backgroundText.includes(query);
  const hasCanvasPages = canvasPages && canvasPages.length > 0;
  const pagesToRender = hasCanvasPages
    ? canvasPages
    : [
        {
          id: activeCanvasId || "default",
          title: t("editor.canvas.defaultLabel"),
          type: "design",
          nodes: objects,
          isFallback: true,
        },
      ];
  const hasAnyMatch =
    !query ||
    (!hasCanvasPages
      ? rows.length > 0 || backgroundMatches
      : canvasPages.some((p) =>
          p.id === activeCanvasId
            ? p.title?.toLowerCase().includes(query) ||
              rows.length > 0 ||
              backgroundMatches
            : checkCanvasMatch(p, query, labels).matchesSelf ||
              checkCanvasMatch(p, query, labels).matchingLayersCount > 0,
        ));
  /** Nothing matches: swap the list for the empty-state copy. */
  const listEmpty = Boolean(query) && !hasAnyMatch;

  const activeObject = activeIndex >= 0 ? objects[activeIndex] : null;
  const opacityPct = activeObject
    ? Math.round((activeObject.opacity ?? 1) * 100)
    : 100;

  const showBackgroundRow = backgroundMatches;

  const visibleTreeItems = buildVisibleTreeItems({
    canvasPages: pagesToRender,
    activeCanvasId,
    collapsedCanvasIds,
    activeRows: rows,
    showBackgroundRow,
    query,
    labels,
    collapsedGroupIdsByCanvas,
  });

  const effectiveCanvasId = activeCanvasId || "default";
  const currentSelectionKey = getSelectionKey(effectiveCanvasId);
  const fallbackTreeKey =
    selectedIds.length === 1
      ? `layer-${effectiveCanvasId}-${selectedIds[0]}`
      : isBackgroundSelected
        ? "canvas-background"
        : activeIndex >= 0
          ? `layer-${effectiveCanvasId}-${objects[activeIndex]?.id}`
          : activeCanvasId
            ? `canvas-${activeCanvasId}`
            : null;
  const currentTreeKey = resolveCurrentTreeKey({
    focusedTreeKey,
    focusedSelectionKey,
    currentSelectionKey,
    fallbackTreeKey,
  });

  const listActiveDescendantDomId = computeActiveDescendantId(
    visibleTreeItems,
    currentTreeKey,
  );

  useEffect(() => {
    if (!listActiveDescendantDomId || typeof document === "undefined") return;
    const row = document.getElementById(listActiveDescendantDomId);
    if (row && listRef.current?.contains(row)) {
      row.scrollIntoView?.({ block: "nearest" });
    }
  }, [listActiveDescendantDomId]);

  const { edit, editAndCommit, commitNow } = usePropertyCommit({
    onMutate: (patch) => activeObject && onMutate?.(activeObject.id, patch),
    onCommit,
  });

  const blendModeLabelKey = (mode) =>
    `editor.blend.${mode.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;

  /** Whether a row paints as selected; see layer_selection.js for the rule. */
  const rowSelectedOf = (node) =>
    isRowSelected(objects, node, {
      selectedIds,
      activeIndex,
      isBackgroundSelected,
      isolationGroupId,
    });

  const { dragId, slot, overId, beginRowDrag } = useLayerDrag({
    listRef,
    nodes: dragUnits,
    onDrop: (id, target, clipIntoId, scope) => {
      const dragged = objects.find((object) => object.id === id);
      if (clipIntoId) {
        // Dropped on a row: a folder takes the layer in as a member, any
        // other layer clips it (Photoshop's two drag gestures, told apart by
        // the drop target). Re-dropping a member onto its own folder is a
        // no-op so the tree is never broken.
        if (dragged?.parentId && dragged.parentId === clipIntoId) return;
        const targetNode = objects.find((object) => object.id === clipIntoId);
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
        const siblings = objects.filter(
          (object) => object.parentId === dragged.parentId,
        );
        const siblingsWithoutDragged = siblings.filter(
          (object) => object.id !== id,
        );
        const withoutDragged = objects.filter((object) => object.id !== id);
        const siblingTarget = siblingsWithoutDragged[target];
        const targetIndex = siblingTarget
          ? withoutDragged.findIndex((object) => object.id === siblingTarget.id)
          : withoutDragged.findIndex(
              (object) => object.id === siblingsWithoutDragged.at(-1)?.id,
            ) + 1;
        if (targetIndex >= 0) onReorder?.(id, targetIndex);
        return;
      }
      if (dragged?.parentId) {
        onMoveNodeToRoot?.(id, target);
        return;
      }
      const unit = dragUnits[target];
      const docTarget = unit ? docIndexOf.get(unit.id) : 0;
      if (isGroupNode(dragged) || isBooleanNode(dragged))
        onReorderGroup?.(id, docTarget);
      else onReorder?.(id, docTarget);
    },
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
    setCollapsedGroupIdsByCanvas((current) => {
      const next = new Map(current);
      const groupIds = new Set(next.get(canvasId) ?? []);
      if (groupIds.has(id)) groupIds.delete(id);
      else groupIds.add(id);
      next.set(canvasId, groupIds);
      return next;
    });
  };

  const toggleGroupCollapse = (groupId, canvasId = effectiveActiveCanvasId) => {
    toggleCollapsed(groupId, canvasId);
    focusTreeItem(
      canvasId === effectiveActiveCanvasId
        ? `layer-${canvasId}-${groupId}`
        : `inactive-layer-${canvasId}-${groupId}`,
    );
  };

  const collectNodeIds = (rowList) => {
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
    const anchorRowIdx = anchorId
      ? rows.findIndex((r) => r.node.id === anchorId)
      : -1;
    const targetRowIdx = rows.findIndex((r) => r.node.id === targetId);

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
    focusTreeItem(
      rowKey,
      exclusivePick
        ? isGroupNode(node)
          ? getTreeSelectionSignature({
              canvasId: effectiveActiveCanvasId,
              selectedIds: groupDescendants({ nodes: objects }, node.id)
                .filter((descendant) => !isGroupNode(descendant))
                .map((descendant) => descendant.id),
            })
          : isBooleanNode(node)
            ? getSelectionKey()
            : getTreeSelectionSignature({
                canvasId: effectiveActiveCanvasId,
                selectedIds: [node.id],
              })
        : getSelectionKey(),
    );
    if ((isGroupNode(node) || isBooleanNode(node)) && exclusivePick) {
      anchorIdRef.current = node.id;
      onSelectGroup?.(node.id);
      return;
    }
    if (event.shiftKey) {
      const anchorId =
        anchorIdRef.current ||
        (selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null) ||
        (activeIndex >= 0 ? objects[activeIndex]?.id : null);
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

  const handleListKeyDown = (event) => {
    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA" ||
      event.target.isContentEditable
    ) {
      return;
    }
    if (
      event.target !== listRef.current &&
      !listRef.current?.contains(event.target)
    ) {
      return;
    }
    if (visibleTreeItems.length === 0) return;

    const res = handleTreeNavigationKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      items: visibleTreeItems,
      currentFocusedKey: currentTreeKey,
      anchorLayerId:
        anchorIdRef.current ||
        (selectedIds.length > 0 ? selectedIds[0] : null) ||
        (activeIndex >= 0 ? objects[activeIndex]?.id : null),
      activeCanvasId,
      callbacks: {
        onSelectCanvas: (canvasId) => {
          focusTreeItem(`canvas-${canvasId}`, `${canvasId}:background`);
          onFocusCanvas?.(canvasId);
        },
        onSelectLayer: (index) => {
          const row = visibleTreeItems.find(
            (item) => item.index === index && item.isActiveCanvas,
          );
          if (row) {
            anchorIdRef.current = row.layerId;
            focusTreeItem(row.key, `${effectiveCanvasId}:${row.layerId}`);
          }
          onSelect(index);
        },
        onSelectCanvasLayer: (canvasId, layerId) => {
          focusTreeItem(
            `inactive-layer-${canvasId}-${layerId}`,
            `${canvasId}:${layerId}`,
          );
          onSelectCanvasLayer?.(canvasId, layerId);
        },
        onSelectBackground: () => {
          focusTreeItem(
            `background-${effectiveCanvasId}`,
            `${effectiveCanvasId}:background`,
          );
          onSelectBackground?.();
        },
        onSelectRange: (anchorId, targetId) => {
          selectRangeBetween(anchorId, targetId);
        },
        onToggleSelect: (index) => {
          onToggleSelect?.(index);
        },
        onToggleCanvasCollapse: (canvasId) => {
          toggleCanvasCollapse(canvasId);
        },
        onToggleGroupCollapse: (nodeId, canvasId) => {
          toggleGroupCollapse(nodeId, canvasId);
        },
        onStartRename: (layerId) => {
          cancelRenameRef.current = false;
          setRenamingId(layerId);
        },
        onDeleteSelected: () => {
          if (onDeleteSelected) onDeleteSelected();
          else if (activeIndex >= 0) onRemove(activeIndex);
        },
      },
    });

    if (res.handled) {
      event.preventDefault();
      if (res.nextFocusedKey) {
        setFocusedTreeKey(res.nextFocusedKey);
      }
    }
  };

  return (
    <aside
      data-testid="editor-layers-panel"
      aria-label={t("editor.layers")}
      className={`absolute ${sideClass} top-1/2 z-30 flex ${LAYERS_PANEL_MAX_HEIGHT_CLASS} max-md:inset-x-3 max-md:w-auto md:w-64 -translate-y-1/2 flex-col rounded-3xl bg-black/95 p-3 shadow-panel backdrop-blur-md font-mono text-neutral-200 transition-[top,max-height,transform] duration-200 ease-out`}
      style={
        bottomInset > 0
          ? {
              top: `calc(50% - ${bottomInset / 2}px)`,
              maxHeight: `calc(100% - ${bottomInset + 80}px)`,
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-2 pb-1.5 pt-1 mb-2">
        <h2 className="text-[11px] font-mono tracking-wider text-neutral-400 font-medium uppercase">
          {t("editor.layers")}
        </h2>
        <div className="-my-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowSearch((prev) => {
                const next = !prev;
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                } else {
                  setSearch("");
                }
                return next;
              });
            }}
            aria-label={t("editor.layers.searchToggle")}
            title={t("editor.layers.searchToggle")}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              showSearch || search
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            <IconSearch size={13} />
          </button>
          {onToggleSide ? (
            <button
              type="button"
              onClick={onToggleSide}
              aria-label={t("editor.pages.toggleAxis")}
              title={t("editor.pages.toggleAxis")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              <IconSwap size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {showSearch ? (
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (search) {
                setSearch("");
              } else {
                setShowSearch(false);
                listRef.current?.focus?.();
              }
            } else if (event.key === "ArrowDown" || event.key === "Enter") {
              event.preventDefault();
              listRef.current?.focus?.();
            }
          }}
          placeholder={t("editor.layers.search")}
          aria-label={t("editor.layers.search")}
          className="mb-2 w-full rounded-xl border border-transparent bg-neutral-900 px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none transition-colors hover:bg-neutral-800 focus:border-[#a7ffd4]/40"
        />
      ) : null}

      <div className="flex flex-row-reverse items-center gap-2 mb-2 border-b border-white/[0.08] pb-2 [&>*:first-child]:w-20 [&>*:last-child]:min-w-0 [&>*:last-child]:flex-1">
        <ScrubField
          prefix={<IconOpacity size={12} />}
          suffix="%"
          min={0}
          max={100}
          value={opacityPct}
          onValueChange={(value) =>
            activeObject && edit({ opacity: value / 100 })
          }
          onCommit={commitNow}
          ariaLabel={t("editor.props.opacity")}
          scrubHint={t("editor.props.dragToAdjust")}
          disabled={!activeObject}
        />
        <FlatSelect
          value={activeObject?.blendMode ?? DEFAULT_BLEND_MODE}
          disabled={!activeObject}
          onChange={(value) => editAndCommit({ blendMode: value })}
          label={t("editor.props.blendMode")}
          options={BLEND_MODES.map((mode) => ({
            value: mode,
            label: t(blendModeLabelKey(mode)),
          }))}
          triggerClassName="!h-7 !w-full !bg-transparent !px-2.5 !text-[11px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          widthClass="w-44"
        />
      </div>

      <div
        ref={listRef}
        data-layers-list
        tabIndex={0}
        role="listbox"
        aria-label={t("editor.layers")}
        aria-multiselectable="true"
        aria-activedescendant={listActiveDescendantDomId}
        onKeyDown={handleListKeyDown}
        onMouseDown={() => listRef.current?.focus?.()}
        className="ui-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden space-y-1 outline-none"
      >
        {listEmpty ? (
          <div className="flex min-h-[80px] items-center justify-center px-3 py-4 text-center text-[11px] font-mono text-neutral-500">
            {t("editor.layers.noMatch")}
          </div>
        ) : (
          <>
            {pagesToRender.map((page) => {
              const isActive = page.id === activeCanvasId || page.isFallback;
              const isCollapsed = !page.isCanvasRoot && collapsedCanvasIds.has(page.id);
              const isExpanded = !isCollapsed;

              if (query && !page.isFallback) {
                const match = isActive
                  ? page.title?.toLowerCase().includes(query) ||
                    rows.length > 0 ||
                    backgroundMatches
                  : checkCanvasMatch(page, query, labels).matchesSelf ||
                    checkCanvasMatch(page, query, labels).matchingLayersCount >
                      0;
                if (!match) return null;
              }

              return (
                <div key={page.id} className="flex flex-col gap-0.5">
                  {!page.isFallback && !page.isCanvasRoot ? (
                    <EditorCanvasTreeRow
                      page={page}
                      isActive={isActive}
                      isCollapsed={!isExpanded}
                      onToggleCollapse={toggleCanvasCollapse}
                      onFocusCanvas={handleCanvasRowFocus}
                      t={t}
                    />
                  ) : null}
                  {isExpanded || page.isFallback ? (
                    <div
                      className={`flex flex-col gap-0.5 ${page.isFallback || page.isCanvasRoot ? "" : "pl-2"}`}
                    >
                      {isActive ? (
                        <>
                          {rows.map(
                            ({ node: object, index, depth, position }) => {
                              const rowSelected = rowSelectedOf(object);
                              const isBoolean = isBooleanNode(object);
                              const grouped = isGroupNode(object) || isBoolean;
                              const instanceSourceDoc =
                                object.kind === "canvasInstance"
                                  ? resolveCanvas?.(object.sourceCanvasId)
                                  : null;
                              const instanceExpandable = Boolean(
                                instanceSourceDoc?.nodes?.length,
                              );
                              const expandable = grouped || instanceExpandable;
                              const collapsed =
                                expandable && collapsedIds.has(object.id);
                              // Top-level rows and group members both drag; a clip-only member
                              // (indented under its base but not parented) stays put.
                              const draggable =
                                !object.locked &&
                                (depth === 0 || Boolean(object.parentId));
                              const isDropTarget = Boolean(
                                draggedChip &&
                                draggedChip.sourceNodeId !== object.id &&
                                !isGroupNode(object) &&
                                !isBoolean &&
                                hoveredRowId === object.id,
                              );

                              return (
                                <Fragment key={object.id}>
                                  <div
                                    role="option"
                                    id={`layer-row-${object.id}`}
                                    aria-selected={rowSelected}
                                    {...(draggable
                                      ? {
                                          "data-layer-row": true,
                                          "data-layer-row-id": object.id,
                                          "data-layer-parent-id":
                                            object.parentId ?? "",
                                        }
                                      : null)}
                                    // Hover is consumed only by isDropTarget,
                                    // which also requires an active drag, so
                                    // tracking it while idle re-rendered every
                                    // row for no visible effect. Gate on the
                                    // drag so drop targeting still follows the
                                    // pointer once a chip is in flight.
                                    onMouseEnter={() => {
                                      if (draggedChip)
                                        setHoveredRowId(object.id);
                                    }}
                                    onMouseLeave={() => {
                                      if (draggedChip)
                                        setHoveredRowId((curr) =>
                                          curr === object.id ? null : curr,
                                        );
                                    }}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setContextMenu({
                                        x: Math.min(
                                          event.clientX,
                                          window.innerWidth - 176,
                                        ),
                                        y: Math.min(
                                          event.clientY,
                                          window.innerHeight - 132,
                                        ),
                                        index,
                                        object,
                                      });
                                    }}
                                    onDragOver={(e) => {
                                      if (
                                        draggedChip &&
                                        draggedChip.sourceNodeId !==
                                          object.id &&
                                        !isGroupNode(object) &&
                                        !isBoolean
                                      ) {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                      }
                                    }}
                                    onDrop={(e) => {
                                      if (
                                        draggedChip &&
                                        draggedChip.sourceNodeId !==
                                          object.id &&
                                        !isGroupNode(object) &&
                                        !isBoolean
                                      ) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        transferKind(
                                          draggedChip.sourceNodeId,
                                          object.id,
                                          draggedChip.kind,
                                          draggedChip.isEffect,
                                        );
                                        setDraggedChip(null);
                                      }
                                    }}
                                    className={`relative rounded-xl transition-colors ${
                                      isDropTarget
                                        ? "bg-emerald-500/10 ring-1 ring-emerald-400/50"
                                        : ""
                                    }`}
                                  >
                                    {!overId &&
                                    dragId &&
                                    slot === position &&
                                    position >= 0 ? (
                                      <div className="pointer-events-none absolute -top-[3px] left-1 right-1 z-20 h-[2px] rounded-full bg-[#a7ffd4]" />
                                    ) : null}
                                    <div
                                      onPointerDown={
                                        draggable
                                          ? (event) =>
                                              beginRowDrag(event, {
                                                node: object,
                                                position,
                                                isChild: depth > 0,
                                                parentId:
                                                  object.parentId ?? null,
                                                siblingNodes:
                                                  depth > 0
                                                    ? (childrenMap.get(
                                                        object.parentId,
                                                      ) ?? [])
                                                    : dragUnits,
                                                range:
                                                  depth > 0
                                                    ? {
                                                        min: 0,
                                                        max: dragUnits.length,
                                                      }
                                                    : undefined,
                                              })
                                          : undefined
                                      }
                                      className={`group/layer relative flex min-h-8 select-none items-center gap-1.5 rounded-lg py-1 transition-colors ${
                                        dragId === object.id
                                          ? "opacity-40 "
                                          : ""
                                      }${
                                        // The drag-over ring wins over the selection shadow, matching the inline boxShadow below.
                                        overId === object.id
                                          ? `bg-neutral-800 ${rowSelectedOf(object) ? "text-neutral-100 " : ""}ring-1 ring-inset ring-[#a7ffd4]`
                                          : rowSelectedOf(object)
                                            ? `bg-neutral-800 text-neutral-100 ${isRowSelected(objects, object, { selectedIds, activeIndex, isBackgroundSelected }) ? "shadow-[inset_0_0_0_1px_#a7ffd4]" : ""}`
                                            : "bg-transparent text-neutral-300 hover:bg-white/[0.08]"
                                      } ${draggable ? "touch-none cursor-default" : ""}`}
                                      style={{
                                        boxShadow:
                                          rowSelected && overId !== object.id
                                            ? "inset 0 0 0 1px #a7ffd4"
                                            : undefined,
                                        paddingLeft:
                                          8 +
                                          depth * 16,
                                        paddingRight: 8,
                                      }}
                                    >
                                      {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l border-white/10" style={{ left: 8 + (depth - 1) * 16 }} />}
                                      {expandable ? (
                                        <button
                                          type="button"
                                          tabIndex={-1}
                                          data-no-drag
                                          onMouseDown={(event) =>
                                            event.preventDefault()
                                          }
                                          onClick={() =>
                                            toggleGroupCollapse(
                                              object.id,
                                              activeCanvasId,
                                            )
                                          }
                                          aria-label={
                                            collapsed
                                              ? t("editor.layer.expandGroup")
                                              : t("editor.layer.collapseGroup")
                                          }
                                          aria-expanded={!collapsed}
                                          className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-100"
                                        >
                                          {collapsed ? (
                                            <IconChevronRight size={12} />
                                          ) : (
                                            <IconChevronDown size={12} />
                                          )}
                                        </button>
                                      ) : <span className="w-4 shrink-0" aria-hidden="true" />}
                                      <button
                                        type="button"
                                        data-no-drag
                                        onClick={() => onToggle(index)}
                                        aria-label={t(
                                          object.visible
                                            ? "editor.hide"
                                            : "editor.show",
                                        )}
                                        title={t(
                                          object.visible
                                            ? "editor.hide"
                                            : "editor.show",
                                        )}
                                        className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-100 disabled:cursor-default disabled:opacity-35"
                                      >
                                        {object.visible ? (
                                          <IconEye size={13} />
                                        ) : (
                                          <IconEyeOff size={13} />
                                        )}
                                      </button>

                                      <div
                                        className="flex items-center gap-1 shrink-0"
                                        data-no-drag
                                        onPointerDown={(e) =>
                                          e.stopPropagation()
                                        }
                                      >
                                        <button
                                          type="button"
                                          data-no-drag
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            if (
                                              maskEdit?.nodeId === object.id
                                            ) {
                                              onEndMaskEdit?.();
                                            }
                                            pickRow(object, index, event);
                                          }}
                                          aria-label={describeNode(
                                            object,
                                            index,
                                            labels,
                                          )}
                                          className="shrink-0"
                                        >
                                          {grouped ? (
                                            <span className="flex h-5 w-7 items-center justify-center text-neutral-400">
                                              {isBoolean ? (
                                                <OperationIcon
                                                  operation={
                                                    object.operation ?? "union"
                                                  }
                                                />
                                              ) : object.frame || object.isFrame || object.containerType === "frame" ? (
                                                <IconFrame size={13} />
                                              ) : (
                                                <IconFolder size={13} />
                                              )}
                                            </span>
                                          ) : (
                                            <EditorLayerThumb
                                              object={object}
                                              getBitmap={getBitmap}
                                            />
                                          )}
                                        </button>
                                        {!grouped && object.imageId ? (
                                          <LayerAssetReload
                                            assetKey={object.imageId}
                                          />
                                        ) : null}

                                        {/* Photoshop-style side-by-side Mask thumbnail */}
                                        {object.maskId ? (
                                          <button
                                            type="button"
                                            data-no-drag
                                            onPointerDown={(event) =>
                                              event.stopPropagation()
                                            }
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              onSelect(index);
                                              if (
                                                maskEdit?.nodeId === object.id
                                              ) {
                                                onEndMaskEdit?.();
                                              } else {
                                                onBeginMaskEdit?.(object.id);
                                              }
                                            }}
                                            title={
                                              maskEdit?.nodeId === object.id
                                                ? t("editor.mask.editingHint")
                                                : t("editor.props.mask")
                                            }
                                            className={`shrink-0 cursor-pointer overflow-hidden rounded-md border transition-all ${
                                              maskEdit?.nodeId === object.id
                                                ? "border-[#E5B2FF] ring-2 ring-[#E5B2FF] shadow-[0_0_8px_rgba(229,178,255,0.4)]"
                                                : "border-white/10 hover:border-[#E5B2FF]/80"
                                            }`}
                                          >
                                            <MaskThumb
                                              object={object}
                                              getNodeMask={getNodeMask}
                                              className="h-5 w-7"
                                            />
                                          </button>
                                        ) : null}
                                      </div>

                                      {renamingId === object.id ? (
                                        <input
                                          ref={(el) => {
                                            el?.focus();
                                            el?.select();
                                          }}
                                          defaultValue={
                                            typeof object.name === "string"
                                              ? object.name
                                              : ""
                                          }
                                          aria-label={t("editor.layer.rename")}
                                          placeholder={describeNode(
                                            { ...object, name: undefined },
                                            index,
                                            labels,
                                          )}
                                          data-no-drag
                                          onPointerDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onKeyDown={(event) =>
                                            handleLayerRenameKeyDown(
                                              event,
                                              cancelRenameRef,
                                            )
                                          }
                                          onBlur={(event) =>
                                            commitRename(
                                              index,
                                              event.target.value,
                                            )
                                          }
                                          className="min-w-0 flex-1 h-5 rounded-lg bg-neutral-800 px-1.5 py-0 text-left text-[11px] font-mono leading-5 text-neutral-100 outline-none ring-1 ring-inset ring-white/10"
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            pickRow(object, index, event)
                                          }
                                          onDoubleClick={() => {
                                            if (
                                              object.kind === "canvasInstance"
                                            ) {
                                              onOpenCanvasInstance?.(
                                                object.sourceCanvasId,
                                              );
                                              return;
                                            }
                                            cancelRenameRef.current = false;
                                            setRenamingId(object.id);
                                          }}
                                          title={t("editor.layer.rename")}
                                          className={`flex min-w-0 flex-1 items-center gap-1.5 h-5 truncate text-left text-[11px] font-mono leading-5 ${
                                            object.visible
                                              ? "text-neutral-200"
                                              : "text-neutral-500"
                                          }`}
                                        >
                                          <span className="truncate">
                                            {describeNode(
                                              object,
                                              index,
                                              labels,
                                            )}
                                          </span>
                                        </button>
                                      )}



                                      {/* Lock buttons cluster: For group nodes, only show the master lock;
                    For ordinary layers, master lock is visible on layer hover, and the 3 granular locks
                    (transparency, pixels, position) fly out in an absolute floating toolbar without shifting the row layout. */}
                                      <div
                                        className="group/locks relative flex items-center shrink-0 -my-1 py-1 px-0.5 rounded-lg transition-colors hover:bg-neutral-800/80"
                                        data-no-drag
                                        onPointerDown={(e) =>
                                          e.stopPropagation()
                                        }
                                      >
                                        {!grouped ? (
                                          <div className="absolute right-full mr-1 top-1/2 -translate-y-1/2 hidden group-hover/locks:flex items-center gap-0.5 rounded-lg bg-neutral-800 p-0.5 shadow-pop border border-white/10 z-30">
                                            {/* Photoshop-style "lock transparent pixels": painting may
                          only mix colour into existing content. */}
                                            <button
                                              type="button"
                                              data-no-drag
                                              onClick={() =>
                                                onToggleLockTransparency(index)
                                              }
                                              aria-label={t(
                                                object.lockTransparency
                                                  ? "editor.lockTransparency"
                                                  : "editor.unlockTransparency",
                                              )}
                                              title={t(
                                                object.lockTransparency
                                                  ? "editor.lockTransparency"
                                                  : "editor.unlockTransparency",
                                              )}
                                              className={`shrink-0 p-1 rounded-md transition-colors ${
                                                object.lockTransparency
                                                  ? "bg-neutral-700 text-white"
                                                  : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"
                                              }`}
                                            >
                                              <IconTransparency
                                                size={12}
                                              />
                                            </button>

                                            {/* Photoshop-style "lock image pixels": the bitmap is frozen */}
                                            <button
                                              type="button"
                                              data-no-drag
                                              onClick={() =>
                                                onToggleLockImagePixels(index)
                                              }
                                              aria-label={t(
                                                object.lockImagePixels
                                                  ? "editor.lockImagePixels"
                                                  : "editor.unlockImagePixels",
                                              )}
                                              title={t(
                                                object.lockImagePixels
                                                  ? "editor.lockImagePixels"
                                                  : "editor.unlockImagePixels",
                                              )}
                                              className={`shrink-0 p-1 rounded-md transition-colors ${
                                                object.lockImagePixels
                                                  ? "bg-neutral-700 text-white"
                                                  : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"
                                              }`}
                                            >
                                              <IconPaint
                                                size={12}
                                              />
                                            </button>

                                            {/* Photoshop-style "lock position": the layer's box is frozen */}
                                            <button
                                              type="button"
                                              data-no-drag
                                              onClick={() =>
                                                onToggleLockPosition(index)
                                              }
                                              aria-label={t(
                                                object.lockPosition
                                                  ? "editor.lockPosition"
                                                  : "editor.unlockPosition",
                                              )}
                                              title={t(
                                                object.lockPosition
                                                  ? "editor.lockPosition"
                                                  : "editor.unlockPosition",
                                              )}
                                              className={`shrink-0 p-1 rounded-md transition-colors ${
                                                object.lockPosition
                                                  ? "bg-neutral-700 text-white"
                                                  : "text-neutral-400 hover:text-white hover:bg-neutral-700/50"
                                              }`}
                                            >
                                              <IconMove
                                                size={12}
                                              />
                                            </button>
                                          </div>
                                        ) : null}

                                        <button
                                          type="button"
                                          data-no-drag
                                          onClick={() => onToggleLock?.(index)}
                                          aria-label={t(
                                            object.locked
                                              ? "editor.unlock"
                                              : "editor.lock",
                                          )}
                                          title={t(
                                            object.locked
                                              ? "editor.unlock"
                                              : "editor.lock",
                                          )}
                                          className="-mx-1.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-100"
                                        >
                                          {object.locked ||
                                          object.lockTransparency ||
                                          object.lockImagePixels ||
                                          object.lockPosition ? (
                                            <IconLock
                                              size={12}
                                              className="text-neutral-300"
                                            />
                                          ) : (
                                            <IconUnlock
                                              size={12}
                                              className="opacity-0 group-hover/layer:opacity-100 group-hover/locks:opacity-100"
                                            />
                                          )}
                                        </button>
                                      </div>

                                      {object.clipTo ? (
                                        <span
                                          className="shrink-0 text-neutral-500"
                                          title={t("editor.layer.clipped")}
                                          aria-label={t("editor.layer.clipped")}
                                        >
                                          <IconClipMask size={11} />
                                        </span>
                                      ) : null}
                                    </div>

                                    {!overId &&
                                    dragId &&
                                    slot === dragUnits.length &&
                                    position === dragUnits.length - 1 ? (
                                      <div className="pointer-events-none absolute -bottom-[3px] left-1 right-1 z-20 h-[2px] rounded-full bg-[#a7ffd4]" />
                                    ) : null}
                                  </div>
                                  {instanceExpandable &&
                                  (!collapsed || query) ? (
                                    <EditorInstanceChildRows
                                      instanceNode={object}
                                      sourceDoc={instanceSourceDoc}
                                      selectedInstanceChild={
                                        selectedInstanceChild
                                      }
                                      onSelectInstanceChild={
                                        onSelectInstanceChild
                                      }
                                      labels={labels}
                                      query={query}
                                      depth={depth}
                                    />
                                  ) : null}
                                </Fragment>
                              );
                            },
                          )}
                        </>
                      ) : (
                        <EditorCanvasInactiveLayers
                          canvasId={page.id}
                          nodes={page.nodes}
                          selectedIds={page.selectedIds}
                          selectedGroupId={page.selectedGroupId}
                          onSelectCanvasLayer={handleSelectInactiveCanvasLayer}
                          collapsedGroupIds={
                            collapsedGroupIdsByCanvas.get(page.id) ?? new Set()
                          }
                          onToggleGroupCollapse={toggleGroupCollapse}
                          labels={labels}
                          query={query}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        )}

        {/* Canvas background layer row at the very bottom */}
        {showBackgroundRow ? (
          <div
            role="option"
            id="layer-row-canvas-background"
            aria-selected={isBackgroundSelected}
            tabIndex={-1}
            className={`group/layer flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all cursor-pointer ${
              isBackgroundSelected
                ? "bg-neutral-800 text-neutral-100 shadow-[inset_0_0_0_1px_#a7ffd4]"
                : "bg-transparent text-neutral-300 hover:bg-white/[0.08]"
            }`}
            style={{
              boxShadow: isBackgroundSelected
                ? "inset 0 0 0 1px #a7ffd4"
                : undefined,
            }}
            onClick={onSelectBackground}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectBackground?.();
              }
            }}
          >
            <div
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
              style={{
                backgroundColor: backgroundTransparent
                  ? "transparent"
                  : displayBg,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-left text-[11px] font-mono font-medium text-neutral-200">
              {t("editor.layer.canvasBackground")}
            </span>
            <span
              className={`text-[11px] font-mono text-neutral-400 ${backgroundTransparent ? "" : "uppercase"}`}
            >
              {displayBg}
            </span>
          </div>
        ) : null}
      </div>

      {/* Dynamic bottom toolbar: Multiple layers selected -> Group + Merge + New Layer; Single layer/group -> Mask + Adjustment + New Layer */}
      <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-2 px-1">
        <div className="flex items-center gap-1">
          {selectedIds.length > 1 ? (
            <>
              {/* Group Selected Layers button */}
              <EditorTooltip
                title={t("editor.layers.groupSelected")}
                side="top"
                disabled={!canGroupSelected}
              >
                <button
                  type="button"
                  onClick={() => onGroupSelected?.()}
                  disabled={!canGroupSelected}
                  aria-label={t("editor.layers.groupSelected")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <IconFolder size={13} />
                </button>
              </EditorTooltip>

              {/* Merge / Combine Selected Layers button */}
              <EditorTooltip
                title={t("editor.layers.mergeSelected")}
                side="top"
                disabled={!canCombineSelected && !canGroupSelected}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onCombineSelected) {
                      onCombineSelected("union");
                    }
                  }}
                  disabled={!canCombineSelected}
                  aria-label={t("editor.layers.mergeSelected")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="2" y="6" width="13" height="13" rx="2" />
                    <path d="M9 18h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H9" />
                  </svg>
                </button>
              </EditorTooltip>
            </>
          ) : (
            <>
              {/* Add Layer Mask button */}
              <EditorTooltip title={t("editor.props.mask")} side="top">
                <button
                  type="button"
                  onClick={() => onAddMask?.()}
                  disabled={!activeObject || Boolean(activeObject.locked)}
                  aria-label={t("editor.props.mask")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <IconMask size={13} strokeWidth={ICON_STROKE_WIDTH} />
                </button>
              </EditorTooltip>

              {/* New Adjustment Layer button */}
              <EditorTooltip
                title={t("editor.layers.addAdjustment")}
                side="top"
              >
                <button
                  type="button"
                  onClick={() => setNewAdjustmentPicker((open) => !open)}
                  aria-label={t("editor.layers.addAdjustment")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor" />
                  </svg>
                </button>
              </EditorTooltip>
            </>
          )}

          {/* Create New Layer button */}
          <EditorTooltip title={t("editor.layer.new")} side="top">
            <button
              type="button"
              onClick={() => onAddLayer?.()}
              aria-label={t("editor.layer.new")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </button>
          </EditorTooltip>
        </div>

        {/* Unified Delete Selected Layer(s) button */}
        <EditorTooltip
          title={maskEdit?.nodeId ? t("editor.mask.delete") : t("node.delete")}
          side="top"
          disabled={
            !maskEdit?.nodeId &&
            selectedIds.length === 0 &&
            (!activeObject || Boolean(activeObject.locked))
          }
        >
          <button
            type="button"
            onClick={() => {
              if (maskEdit?.nodeId) {
                if (onRemoveMask) {
                  onRemoveMask(maskEdit.nodeId);
                } else if (onDeleteSelected) {
                  onDeleteSelected();
                }
              } else if (onDeleteSelected) {
                onDeleteSelected();
              } else if (
                activeObject &&
                !activeObject.locked &&
                activeIndex >= 0
              ) {
                onRemove(activeIndex);
              }
            }}
            disabled={
              !maskEdit?.nodeId &&
              selectedIds.length === 0 &&
              (!activeObject || Boolean(activeObject.locked))
            }
            aria-label={
              maskEdit?.nodeId ? t("editor.mask.delete") : t("node.delete")
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          >
            <IconTrash size={13} />
          </button>
        </EditorTooltip>
      </div>

      {newAdjustmentPicker ? (
        <AddKindPicker
          isImage={true}
          showEffects={false}
          onPick={(kind) => {
            setNewAdjustmentPicker(false);
            onAddAdjustmentLayer?.(kind);
          }}
          onClose={() => setNewAdjustmentPicker(false)}
          side={swapSide ? "right" : "left"}
        />
      ) : null}

      {popoverNode && popover ? (
        popover.kind ? (
          <AdjustmentPopover
            node={popoverNode}
            kind={popover.kind}
            isEffect={popover.isEffect}
            bitmap={getBitmap?.(popoverNode) ?? null}
            onMutate={onMutate}
            onCommit={onCommit}
            onClose={() => setPopover(null)}
            side={swapSide ? "right" : "left"}
          />
        ) : (
          <AddKindPicker
            isImage={popoverNode.kind === "image"}
            bitmap={getBitmap?.(popoverNode) ?? null}
            imageKey={popoverNode.imageId ?? popoverNode.src ?? null}
            adjustments={popoverNode.adjustments ?? null}
            onPick={(kind, isEffect) => addKind(popoverNode.id, kind, isEffect)}
            onApplyPreset={(preset) => applyPreset(popoverNode.id, preset)}
            onClose={() => setPopover(null)}
            side={swapSide ? "right" : "left"}
          />
        )
      ) : null}

      {/* Row context menu: rename / lock / delete, built from the props the
          panel already receives — no parent wiring needed. */}
      {contextMenu
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-50"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setContextMenu(null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu(null);
                }}
              />
              <div
                role="menu"
                className="fixed z-50 w-40 rounded-xl border border-white/10 bg-neutral-900 p-1 font-mono text-[11px] text-neutral-200 shadow-menu"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    cancelRenameRef.current = false;
                    setRenamingId(contextMenu.object.id);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {t("editor.layer.rename")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleLock?.(contextMenu.index);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {t(
                    contextMenu.object.locked ? "editor.unlock" : "editor.lock",
                  )}
                </button>
                <div className="my-1 h-px bg-white/10" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDuplicateLayer?.(contextMenu.index);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {t("editor.menu.duplicate")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onLayerToFront?.(contextMenu.index);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {t("editor.menu.bringToFront")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onLayerToBack?.(contextMenu.index);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {t("editor.menu.sendToBack")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    !RASTERIZABLE_NODE_KINDS.has(contextMenu.object.kind)
                  }
                  onClick={() => {
                    if (RASTERIZABLE_NODE_KINDS.has(contextMenu.object.kind))
                      onRasterize?.(contextMenu.index);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
                >
                  {t("editor.menu.rasterize")}
                </button>
                {canConvertToPath(contextMenu.object) ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (onConvertToPath) {
                        onConvertToPath(contextMenu.object.id);
                      } else if (onMutate) {
                        const converted = convertShapeToPathNode(
                          contextMenu.object,
                        );
                        if (converted) {
                          onMutate(contextMenu.object.id, converted);
                          onCommit?.("editor.history.entry.convertToPath");
                        }
                      }
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    {t("editor.menu.convertToPath")}
                  </button>
                ) : null}
                <div className="my-1 h-px bg-white/10" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(contextMenu.object.locked)}
                  onClick={() => {
                    if (!contextMenu.object.locked) {
                      if (
                        onDeleteSelected &&
                        selectedIds.includes(contextMenu.object.id)
                      ) {
                        onDeleteSelected();
                      } else {
                        onRemove(contextMenu.index);
                      }
                    }
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-30"
                >
                  {t("node.delete")}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </aside>
  );
}

EditorLayers.propTypes = {
  canvasPages: PropTypes.arrayOf(PropTypes.object),
  selectedCanvasIds: PropTypes.arrayOf(PropTypes.string),
  activeCanvasId: PropTypes.string,
  onFocusCanvas: PropTypes.func,
  onSelectCanvasLayer: PropTypes.func,
  onOpenCanvasInstance: PropTypes.func,
  resolveCanvas: PropTypes.func,
  selectedInstanceChild: PropTypes.shape({
    instanceId: PropTypes.string.isRequired,
    sourceCanvasId: PropTypes.string.isRequired,
    nodeId: PropTypes.string.isRequired,
  }),
  onSelectInstanceChild: PropTypes.func,
  initialCollapsedCanvasIds: PropTypes.arrayOf(PropTypes.string),
  initialSearch: PropTypes.string,
  bottomInset: PropTypes.number,
  objects: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeIndex: PropTypes.number,
  backgroundColor: PropTypes.string,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  isBackgroundSelected: PropTypes.bool,
  /** The folder being edited in isolation; its row stays lit while open. */
  isolationGroupId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onToggleSelect: PropTypes.func,
  onSelectExactly: PropTypes.func,
  onSelectBackground: PropTypes.func,
  /** A group row's pick: selects the folder's whole contents. */
  onSelectGroup: PropTypes.func,
  onToggle: PropTypes.func.isRequired,
  onToggleLock: PropTypes.func,
  onToggleLockTransparency: PropTypes.func,
  onToggleLockPosition: PropTypes.func,
  onToggleLockImagePixels: PropTypes.func,
  /** Called on drop with the node id and its target document index. */
  onReorder: PropTypes.func,
  /** A folder row's drop: the block moves with it. */
  onReorderGroup: PropTypes.func,
  onRemove: PropTypes.func.isRequired,
  onRemoveMask: PropTypes.func,
  onDeleteSelected: PropTypes.func,
  /** Called with the index and the trimmed name, or null to clear a rename. */
  onRename: PropTypes.func,
  onLayerToFront: PropTypes.func,
  onLayerToBack: PropTypes.func,
  /** Bakes a layer's live effects (mask/warp/adjustments) into its bitmap. */
  onRasterize: PropTypes.func,
  onConvertToPath: PropTypes.func,
  onDuplicateLayer: PropTypes.func,
  onMutate: PropTypes.func,
  onCommit: PropTypes.func,
  /** Returns the decoded bitmap for a node, or null while it loads. */
  getBitmap: PropTypes.func,
  /** Returns the decoded mask for a node, or null while it loads. */
  getNodeMask: PropTypes.func,
  /** Mask editing state: which node's mask is being painted, if any. */
  maskEdit: PropTypes.shape({ nodeId: PropTypes.string }),
  onBeginMaskEdit: PropTypes.func,
  onEndMaskEdit: PropTypes.func,
  /** True parks the panel on the opposite edge; the swap button flips it. */
  swapSide: PropTypes.bool,
  onToggleSide: PropTypes.func,
  onAddAdjustmentLayer: PropTypes.func,
  onAddLayer: PropTypes.func,
  onAddMask: PropTypes.func,
  /** ⌘G: wrap the selected top-level layers in a new folder. */
  onGroupSelected: PropTypes.func,
  /** Whether at least two selectable units are selected (folder button). */
  canGroupSelected: PropTypes.bool,
  onCombineSelected: PropTypes.func,
  canCombineSelected: PropTypes.bool,
  /** Drag-drop: clip `sourceId` into `targetId` (drop a layer onto another). */
  onClipInto: PropTypes.func,
  onMoveIntoGroup: PropTypes.func,
  /** A group member dropped on a root slot: detach it from its folder. */
  onMoveNodeToRoot: PropTypes.func,
};

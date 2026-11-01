import { describeNode, isGroupNode, isBooleanNode } from "../editor/scene_model.js";
import { sourceLayerRows } from "./editor-instance-layer-model.js";
import { isGroupExpandedInSearch } from "./editor_canvas_tree_nav.js";
import { checkCanvasMatch } from "./editor_canvas_tree_model.js";
import { buildVisibleTreeItems } from "./editor_canvas_tree_items.js";
import { layerTopology } from "./editor_layer_topology.js";
import { subtreeMatcher } from "./editor_layer_search.js";
export default function buildEditorLayerTree(model) {
  const {
    objects,
    canvasPages,
    activeCanvasId,
    query,
    labels,
    resolveCanvas,
    collapsedIds,
    t,
    backgroundColor,
    activeIndex,
    collapsedCanvasIds,
    collapsedGroupIdsByCanvas
  } = model;
  const panelObjects = objects;
  const { docIndexOf, childrenMap, units, clipMap, clipTargets } = layerTopology(objects);
  const activePage = canvasPages?.find(p => p.id === activeCanvasId);
  const activeCanvasTitleMatches = Boolean(query && activePage && activePage.title?.toLowerCase().includes(query));

  /**
  * Search/filter. A row matches when its displayed label — the node's
  * `name`, or the `describeNode` fallback — contains the query. A group or
  * clip base that has a matching descendant stays visible, so a hit inside
  * a folder or clip chain stays reachable in context.
  */
  const rowMatches = node => {
    if (!query || activeCanvasTitleMatches) return true;
    const label = describeNode(node, docIndexOf.get(node.id) ?? 0, labels);
    return label.toLowerCase().includes(query);
  };
  const sourceMatches = new Map();
  const subtreeMatches = !query || activeCanvasTitleMatches ? () => true :
    subtreeMatcher(panelObjects, childrenMap, clipMap, node => {
      if (rowMatches(node)) return true;
      if (node.kind !== "canvasInstance" || !resolveCanvas) return false;
      const source = resolveCanvas(node.sourceCanvasId);
      if (!sourceMatches.has(source)) sourceMatches.set(source,
        sourceLayerRows(source, (child, index) => describeNode(child, index, labels), query).length > 0);
      return sourceMatches.get(source);
    });

  /**
  * The rows on display, top first. A folder's members follow it indented
  * unless it is collapsed; a clipping chain's members follow their base
  * indented one level, so a layer dragged into another reads as that
  * layer's child beneath it. `position` numbers only the top-level rows —
  * the drag math runs on those alone.
  */
  const rows = [];
  const displayedIds = new Set();
  let topPosition = 0;
  const pushRow = (node, depth, siblingPosition = -1) => {
    if (displayedIds.has(node.id)) return;
    // A filtered-out row drops from both display and drag math; ancestors of
    // a match stay so the tree reads coherently.
    if (query && !subtreeMatches(node)) return;
    displayedIds.add(node.id);
    rows.push({
      node,
      index: docIndexOf.get(node.id),
      depth,
      position: depth === 0 ? topPosition : siblingPosition
    });
    if (depth === 0) topPosition += 1;
    const isGroup = isGroupNode(node) || isBooleanNode(node);
    const groupExpanded = isGroup && isGroupExpandedInSearch(node, collapsedIds, query, childrenMap, subtreeMatches);
    if (groupExpanded) {
      const children = childrenMap.get(node.id) ?? [];
      for (let i = children.length - 1; i >= 0; i -= 1) pushRow(children[i], depth + 1, children.length - i - 1);
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
  const dragUnits = units.filter(unit => !clipTargets.has(unit.id) && (!query || subtreeMatches(unit)));
  for (let i = dragUnits.length - 1; i >= 0; i -= 1) pushRow(dragUnits[i], 0);

  /** The background pseudo-row matches when its label or shown colour does. */
  const backgroundLabel = t("editor.layer.canvasBackground") || t("editor.layer.background");
  // A transparent page says so; a stand-in colour would read as applied.
  const backgroundTransparent = !backgroundColor || backgroundColor === "transparent";
  const displayBg = backgroundTransparent ? t("editor.layer.transparent") : backgroundColor;
  const backgroundText = `${backgroundLabel} ${displayBg}`.toLowerCase();
  const backgroundMatches = !query || backgroundText.includes(query);
  const hasCanvasPages = canvasPages && canvasPages.length > 0;
  const pagesToRender = hasCanvasPages ? canvasPages : [{
    id: activeCanvasId || "default",
    title: t("editor.canvas.defaultLabel"),
    type: "design",
    nodes: objects,
    isFallback: true
  }];
  const hasAnyMatch = !query || (!hasCanvasPages ? rows.length > 0 || backgroundMatches :
    canvasPages.some(page => {
      if (page.id === activeCanvasId) return page.title?.toLowerCase().includes(query) || rows.length > 0 || backgroundMatches;
      const match = checkCanvasMatch(page, query, labels);
      return match.matchesSelf || match.matchingLayersCount > 0;
    }));
  /** Nothing matches: swap the list for the empty-state copy. */
  const listEmpty = Boolean(query) && !hasAnyMatch;
  const activeObject = activeIndex >= 0 ? objects[activeIndex] : null;
  const opacityPct = activeObject ? Math.round((activeObject.opacity ?? 1) * 100) : 100;
  const showBackgroundRow = backgroundMatches;
  const visibleTreeItems = buildVisibleTreeItems({
    canvasPages: pagesToRender,
    activeCanvasId,
    collapsedCanvasIds,
    activeRows: rows,
    showBackgroundRow,
    query,
    labels,
    collapsedGroupIdsByCanvas
  });
  return {
    docIndexOf,
    panelObjects,
    childrenMap,
    units,
    clipMap,
    activePage,
    activeCanvasTitleMatches,
    rowMatches,
    subtreeMatches,
    rows,
    topPosition,
    pushRow,
    dragUnits,
    backgroundLabel,
    backgroundTransparent,
    displayBg,
    backgroundText,
    backgroundMatches,
    hasCanvasPages,
    pagesToRender,
    hasAnyMatch,
    listEmpty,
    activeObject,
    opacityPct,
    showBackgroundRow,
    visibleTreeItems
  };
}

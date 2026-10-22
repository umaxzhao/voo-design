import { isGroupNode, isBooleanNode } from "../editor/scene_model.js";
import { buildInactiveCanvasRows } from "./editor_canvas_tree_model.js";

/**
 * Builds a flat list of visible tree items in display order (top-to-bottom),
 * encompassing canvas parents, active layers, background rows, and inactive layers.
 */
export function buildVisibleTreeItems({
  canvasPages = [],
  activeCanvasId = null,
  collapsedCanvasIds = new Set(),
  activeRows = [],
  showBackgroundRow = false,
  query = "",
  labels = {},
  collapsedGroupIdsByCanvas = new Map(),
}) {
  const items = [];
  const pages =
    canvasPages.length > 0
      ? canvasPages
      : [
          {
            id: activeCanvasId || "default",
            title: "Canvas",
            type: "design",
            isFallback: true,
          },
        ];

  for (const page of pages) {
    const isActive = page.id === activeCanvasId || page.isFallback;
    const isCollapsed = collapsedCanvasIds.has(page.id);
    const isExpanded = !isCollapsed;

    if (!page.isFallback) {
      items.push({
        key: `canvas-${page.id}`,
        domId: `canvas-row-${page.id}`,
        type: "canvas",
        canvasId: page.id,
        page,
        depth: 0,
        isExpanded,
        isActive,
      });
    }

    if (isExpanded) {
      if (isActive) {
        for (const row of activeRows) {
          const isGroup = isGroupNode(row.node) || isBooleanNode(row.node);
          const hasVisibleChildren = activeRows.some(
            (candidate) => candidate.node.parentId === row.node.id,
          );
          items.push({
            key: `layer-${page.id}-${row.node.id}`,
            domId: `layer-row-${row.node.id}`,
            type: "layer",
            canvasId: page.id,
            layerId: row.node.id,
            node: row.node,
            index: row.index,
            depth: (row.depth ?? 0) + (page.isFallback ? 0 : 1),
            isActiveCanvas: true,
            isGroup,
            hasChildren: hasVisibleChildren,
            isExpanded: isGroup && hasVisibleChildren,
            parentId: row.node.parentId || null,
          });
        }
      } else {
        const collapsedForCanvas =
          collapsedGroupIdsByCanvas.get(page.id) ?? new Set();
        const inactiveRows = buildInactiveCanvasRows(
          page.nodes || [],
          labels,
          query,
          { collapsedGroupIds: collapsedForCanvas },
        );
        for (const row of inactiveRows) {
          items.push({
            key: `inactive-layer-${page.id}-${row.node.id}`,
            domId: `layer-row-${page.id}-${row.node.id}`,
            type: "inactive-layer",
            canvasId: page.id,
            layerId: row.node.id,
            node: row.node,
            index: row.index,
            depth: (row.depth ?? 0) + 1,
            isActiveCanvas: false,
            isGroup: row.isGroup,
            hasChildren: row.hasChildren,
            isExpanded: row.hasChildren && !row.isCollapsed,
            parentId: row.node.parentId || null,
          });
        }
      }
    }
  }

  if (showBackgroundRow) {
    items.push({
      key: "canvas-background",
      domId: "layer-row-canvas-background",
      type: "background",
      canvasId: null,
      depth: 0,
      isActiveCanvas: true,
    });
  }

  return items;
}

import buildEditorLayerTree from "./editor_layer_tree_model.js";
import { layerTopology } from "./editor_layer_topology.js";

// Match the existing panel render counter: opt-in browser evidence only.
const BUILD_COUNTER = typeof window !== "undefined" && window.location?.search?.includes("voo-test=1")
  ? "__vooTestLayerTreeBuilds" : null;

const sameRecord = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]));
};
const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));
const sameMap = (a, b) => a.size === b.size && [...a].every(([key, value]) => b.has(key) && sameSet(value, b.get(key)));
const samePages = (a, b) => a.length === b.length && a.every((page, index) => sameRecord(page, b[index]));

function snapshot(model) {
  const rootIds = new Set((model.canvasPages ?? []).filter(page => page.isCanvasRoot).map(page => page.id));
  return {
    values: { objects: model.objects, length: model.objects.length,
      activeCanvasId: model.activeCanvasId, query: model.query,
      backgroundColor: model.backgroundColor, resolveCanvas: model.resolveCanvas, t: model.t },
    labels: { ...model.labels },
    // Deferred dictionaries may resolve without changing the locale or t identity.
    translations: ["editor.layer.canvasBackground", "editor.layer.background",
      "editor.layer.transparent", "editor.canvas.defaultLabel"].map(key => model.t(key)),
    pages: (model.canvasPages ?? []).map(page => {
      const structural = { ...page };
      delete structural.selectedIds;
      delete structural.selectedGroupId;
      return structural;
    }),
    collapsed: new Set(model.collapsedIds),
    canvases: new Set([...model.collapsedCanvasIds].filter(id => !rootIds.has(id))),
    groups: new Map([...model.collapsedGroupIdsByCanvas].map(([id, ids]) => [id, new Set(ids)])),
  };
}

/** One bounded model per mounted panel; selection controls stay live on a hit. */
export function createLayerTreeCache() {
  let previous, tree, pageSlots = [];
  return model => {
    const next = snapshot(model);
    const reusable = previous && sameRecord(previous.values, next.values) &&
      sameRecord(previous.labels, next.labels) && samePages(previous.pages, next.pages) &&
      previous.translations.every((value, index) => value === next.translations[index]) &&
      sameSet(previous.collapsed, next.collapsed) && sameSet(previous.canvases, next.canvases) &&
      sameMap(previous.groups, next.groups);
    // A stable resolver can expose an updated master outside this panel's pages.
    // Search those instances afresh rather than retaining stale external results.
    const liveSourceSearch = model.query && model.resolveCanvas && layerTopology(model.objects).hasInstances;
    if (!reusable || liveSourceSearch) {
      if (BUILD_COUNTER) window[BUILD_COUNTER] = (window[BUILD_COUNTER] ?? 0) + 1;
      tree = buildEditorLayerTree(model);
      pageSlots = [];
      tree.visibleTreeItems.forEach((item, index) => { if (item.page) pageSlots.push(index); });
      previous = next;
    }
    // Page selection is live metadata, not hierarchy. Refresh only canvas
    // descriptors; retain the expensive active rows and their window offsets.
    const pagesToRender = model.canvasPages?.length ? model.canvasPages : tree.pagesToRender;
    let visibleTreeItems = tree.visibleTreeItems;
    if (pageSlots.length) {
      const pages = new Map(pagesToRender.map(page => [page.id, page]));
      for (const index of pageSlots) {
        const item = tree.visibleTreeItems[index], page = pages.get(item.canvasId);
        if (page && page !== item.page) {
          if (visibleTreeItems === tree.visibleTreeItems) visibleTreeItems = visibleTreeItems.slice();
          visibleTreeItems[index] = { ...item, page };
        }
      }
    }
    const activeObject = model.activeIndex >= 0 ? model.objects[model.activeIndex] : null;
    return { ...tree, pagesToRender, visibleTreeItems,
      activePage: model.canvasPages?.find(page => page.id === model.activeCanvasId),
      activeObject, opacityPct: activeObject ? Math.round((activeObject.opacity ?? 1) * 100) : 100 };
  };
}

import { describe, expect, it } from "vitest";
import buildEditorLayerTree from "../../src/canvas/components/editor_layer_tree_model.js";
import { createLayerTreeCache } from "../../src/canvas/components/editor_layer_tree_cache.js";
import { buildInactiveCanvasRows } from "../../src/canvas/components/editor_canvas_tree_model.js";
import { subtreeMatcher } from "../../src/canvas/components/editor_layer_search.js";

const modelFor = objects => ({ objects, canvasPages: [], activeCanvasId: "page",
  query: "", labels: {}, t: key => key, collapsedIds: new Set(),
  collapsedCanvasIds: new Set(), collapsedGroupIdsByCanvas: new Map(),
  backgroundColor: "transparent", activeIndex: -1 });

describe("layer model repeated work", () => {
  it("retains immutable topology when only selection or query changes", () => {
    const objects = [{ id: "frame", kind: "group", name: "Frame" },
      { id: "child", kind: "rect", name: "Needle", parentId: "frame" }];
    const first = buildEditorLayerTree(modelFor(objects));
    const second = buildEditorLayerTree({ ...modelFor(objects), activeIndex: 1, query: "needle" });
    expect(second.rows.map(row => row.node.id)).toEqual(["frame", "child"]);
    expect(second.activeObject).toBe(objects[1]);
    expect(second.docIndexOf).toBe(first.docIndexOf);
    expect(second.childrenMap).toBe(first.childrenMap);
  });

  it("reads each search label once instead of revisiting every ancestor path", () => {
    let reads = 0;
    const objects = Array.from({ length: 120 }, (_, index) => ({
      id: `node-${index}`, kind: index === 119 ? "rect" : "group",
      ...(index ? { parentId: `node-${index - 1}` } : {}),
      get name() { reads++; return index === 119 ? "Needle" : "Folder"; },
    }));
    const result = buildEditorLayerTree({ ...modelFor(objects), query: "needle" });
    expect(result.rows).toHaveLength(objects.length);
    expect(reads).toBeLessThanOrEqual(objects.length * 2);
  });
});

describe("bounded panel model cache", () => {
  const objects = [{ id: "frame", kind: "group", name: "Frame" },
    { id: "child", kind: "rect", name: "Needle", opacity: .3, parentId: "frame" }];

  it("reuses rows through selection and equal replacement sets, keeping controls current", () => {
    const cached = createLayerTreeCache(), model = modelFor(objects);
    const first = cached(model);
    const next = cached({ ...model, activeIndex: 1, labels: {},
      collapsedIds: new Set(), collapsedCanvasIds: new Set(), collapsedGroupIdsByCanvas: new Map() });
    expect(next.rows).toBe(first.rows);
    expect(next.visibleTreeItems).toBe(first.visibleTreeItems);
    expect(next.activeObject).toBe(objects[1]);
    expect(next.opacityPct).toBe(30);
    expect(next.activePage).toBeUndefined();
    expect(cached({ ...model, activeIndex: -1 }).activeObject).toBeNull();
  });

  it("invalidates immutable edits and reuses topology only for the same node array", () => {
    const cached = createLayerTreeCache(), model = { ...modelFor(objects), query: "needle" };
    const first = cached(model);
    const next = cached({ ...model, objects: [objects[0], { ...objects[1], name: "Other" }] });
    expect(next.rows).toHaveLength(0);
    expect(next.docIndexOf).not.toBe(first.docIndexOf);
    expect(cached(model).rows.map(row => row.node.id)).toEqual(["frame", "child"]);
  });

  it("keeps page selection live without rebuilding root or ordinary page rows", () => {
    for (const isCanvasRoot of [false, true]) {
      const cached = createLayerTreeCache(), model = modelFor(objects);
      model.canvasPages = [{ id: "page", title: "Page", nodes: objects, isCanvasRoot, selectedIds: [] }];
      const first = cached(model);
      const selected = { ...model.canvasPages[0], selectedIds: ["child"], selectedGroupId: "frame" };
      const next = cached({ ...model, canvasPages: [selected],
        collapsedCanvasIds: new Set(isCanvasRoot ? ["page"] : []) });
      expect(next.rows).toBe(first.rows);
      expect(next.pagesToRender[0]).toBe(selected);
      expect(next.activePage).toBe(selected);
      if (!isCanvasRoot) expect(next.visibleTreeItems.find(item => item.type === "canvas").page).toBe(selected);
    }
  });

  it("tracks collapse contents and metadata even when callers reuse their containers", () => {
    const cached = createLayerTreeCache(), model = modelFor(objects);
    expect(cached(model).rows).toHaveLength(2);
    model.collapsedIds.add("frame");
    expect(cached(model).rows.map(row => row.node.id)).toEqual(["frame"]);
    const found = cached({ ...model, query: "needle" });
    expect(found.rows).toHaveLength(2);
    expect(cached(model).rows).toHaveLength(1);
    model.canvasPages = [{ id: "page", title: "Other", nodes: objects }];
    expect(cached({ ...model, query: "renamed" }).rows).toHaveLength(0);
    model.canvasPages[0].title = "Renamed";
    expect(cached({ ...model, query: "renamed" }).rows).toHaveLength(2);
  });

  it("invalidates deferred translations without relying on translator identity", () => {
    const cached = createLayerTreeCache();
    let language = "first";
    const model = { ...modelFor(objects), t: key => `${language}:${key}` };
    const first = cached(model);
    language = "second";
    const next = cached(model);
    expect(next.backgroundLabel).toContain("second:");
    expect(next.rows).not.toBe(first.rows);
    expect(cached({ ...model, labels: { rect: "Localized" } }).rows).not.toBe(next.rows);
  });

  it("tracks inactive document replacement, disclosure and nested groups", () => {
    const cached = createLayerTreeCache(), model = modelFor(objects);
    const inactive = { id: "other", title: "Other", nodes: objects };
    model.canvasPages = [{ id: "page", title: "Page", nodes: objects }, inactive];
    const initial = cached(model);
    model.collapsedGroupIdsByCanvas.set("other", new Set(["frame"]));
    const collapsed = cached(model);
    expect(collapsed.visibleTreeItems.length).toBe(initial.visibleTreeItems.length - 1);
    model.collapsedCanvasIds.add("other");
    expect(cached(model).visibleTreeItems.some(item => item.type === "inactive-layer")).toBe(false);
    model.collapsedCanvasIds.clear();
    inactive.nodes = [{ id: "replacement", kind: "rect", name: "Replacement" }];
    expect(cached(model).visibleTreeItems.some(item => item.layerId === "replacement")).toBe(true);
  });

  it("refreshes instance search when a stable resolver exposes a changed external master", () => {
    const cached = createLayerTreeCache();
    let source = { nodes: [{ id: "leaf", kind: "rect", name: "Needle" }] };
    const model = { ...modelFor([{ id: "instance", kind: "canvasInstance", sourceCanvasId: "master", name: "Instance" }]),
      query: "needle", resolveCanvas: () => source };
    expect(cached(model).rows).toHaveLength(1);
    source = { nodes: [{ id: "leaf", kind: "rect", name: "Changed" }] };
    expect(cached(model).rows).toHaveLength(0);
  });
});

describe("search reachability", () => {
  it("propagates a match through cycles and clip edges without caching path-dependent misses", () => {
    const nodes = ["a", "b", "c", "leaf"].map(id => ({ id }));
    const children = new Map([["a", [nodes[1]]], ["b", [nodes[0], nodes[2]]]]);
    const clips = new Map([["c", [nodes[3]]]]);
    const matches = subtreeMatcher(nodes, children, clips, node => node.id === "leaf");
    expect(nodes.every(matches)).toBe(true);
  });

  it("keeps matching inactive ancestors and preserves unmatched cycle recovery", () => {
    const nodes = [{ id: "a", kind: "group", name: "A", parentId: "b" },
      { id: "b", kind: "group", name: "Needle", parentId: "a" }];
    expect(buildInactiveCanvasRows(nodes, {}, "needle").map(row => row.node.id).sort()).toEqual(["a", "b"]);
    expect(buildInactiveCanvasRows(nodes, {}, "missing")).toEqual([]);
  });
});

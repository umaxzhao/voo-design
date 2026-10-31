import { describe, expect, it } from "vitest";
import { combineNodes, insertGroup, ungroupNodes } from "../../src/canvas/editor/doc_ops_groups.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import { createSelection } from "../../src/canvas/editor/editor_selection.js";
import { expandStrokeToPathNode } from "../../src/canvas/editor/path_expand_stroke.js";

const group = (id, parentId = null, patch = {}) => ({ id, kind: "group", parentId, x: 0, y: 0, width: 300, height: 200, ...patch });
const rect = (id, parentId = null, patch = {}) => ({ id, kind: "rect", parentId, x: 20, y: 20, width: 40, height: 30, ...patch });
const document = nodes => ({ width: 800, height: 600, nodes });
const get = (doc, id) => doc.nodes.find(node => node.id === id);

describe("container command boundaries", () => {
  it("resolves through every simultaneously dissolved ancestor", () => {
    const doc = document([group("frame", null, { isFrame: true }), group("a", "frame"), group("b", "a"), rect("leaf", "b")]);
    const next = ungroupNodes(doc, ["a", "b"]);
    expect(next.nodes.map(node => node.id)).toEqual(["frame", "leaf"]);
    expect(get(next, "leaf").parentId).toBe("frame");
  });
  it("does not detach a selected descendant from an already selected ancestor when grouping", () => {
    const doc = document([group("frame", null, { isFrame: true }), rect("leaf", "frame"), rect("loose")]);
    const next = insertGroup(doc, group("folder"), ["frame", "leaf", "loose"]);
    expect(get(next, "frame").parentId).toBe("folder");
    expect(get(next, "leaf").parentId).toBe("frame");
  });
  it("uses the nearest shared container for members from different nested Frames", () => {
    const doc = document([group("outer", null, { isFrame: true }), group("a", "outer", { isFrame: true }), rect("red", "a"), group("b", "outer", { isFrame: true }), rect("blue", "b")]);
    const next = insertGroup(doc, group("folder"), ["red", "blue"]);
    expect(get(next, "folder").parentId).toBe("outer");
    expect(get(next, "red").parentId).toBe("folder");
    expect(get(next, "blue").parentId).toBe("folder");
  });
  it("does not retain dangling clipping references when their container is dissolved", () => {
    const doc = document([group("base"), rect("child", "base"), rect("follower", null, { clipTo: "base" })]);
    const next = ungroupNodes(doc, ["base"]);
    expect(get(next, "follower").clipTo ?? null).toBeNull();
  });
  it("uses sharedGroupParent and releases cross-container clipTo when combining Boolean shapes across Frames", () => {
    const doc = document([
      group("outer", null, { isFrame: true }),
      group("frame-a", "outer", { isFrame: true }),
      rect("shape-a", "frame-a"),
      rect("clipped-outside", "frame-a", { clipTo: "shape-a" }),
      group("frame-b", "outer", { isFrame: true }),
      rect("shape-b", "frame-b"),
    ]);
    const { doc: next, id: boolId } = combineNodes(doc, ["shape-a", "shape-b"], "union");
    expect(get(next, boolId).parentId).toBe("outer");
    expect(get(next, "shape-a").parentId).toBe(boolId);
    expect(get(next, "shape-b").parentId).toBe(boolId);
    expect(get(next, "clipped-outside").clipTo).toBeUndefined();
  });
  it("cleans up emptied groups, dangling clipTo, and preserves shared parent in destructiveBoolean", () => {
    let doc = document([
      group("frame-a", null, { isFrame: true }),
      rect("r1", "frame-a", { x: 20, y: 20, width: 60, height: 60 }),
      group("folder-b", null),
      rect("r2", "folder-b", { x: 40, y: 40, width: 60, height: 60 }),
      rect("follower", null, { clipTo: "r1" }),
    ]);
    const selection = createSelection({});
    selection.selectNodes(["r1", "r2"]);
    const opsApi = createEngineNodeOps({
      getDoc: () => doc, setDoc: (next) => { doc = next; }, selection,
      cache: {}, releaseNodeTextures: () => {}, maskTools: {}, paintTools: {}, penTools: {},
      getEffectiveNode: (n) => n, requestRender: () => {}, notify: () => {}, getZoom: () => 1,
    });
    expect(opsApi.destructiveBoolean("union")).toBe(true);
    const result = doc.nodes.find((n) => n.kind === "path");
    expect(result.parentId).toBeNull();
    expect(get(doc, "folder-b")).toBeUndefined();
    expect(get(doc, "follower").clipTo).toBeUndefined();
    expect(selection.getIds()).toEqual([result.id]);
  });
  it("selects the created/attached text node and inherits parentId in typeOnSelectedPath & attachTextToPath", () => {
    let doc = document([
      group("frame-1", null, { isFrame: true }),
      {
        id: "path-1", kind: "path", pen: true, parentId: "frame-1",
        x: 30, y: 40, width: 120, height: 40, baseWidth: 120, baseHeight: 40,
        points: [{ x: 0, y: 20 }, { x: 120, y: 20 }],
      },
      { id: "txt-1", kind: "text", parentId: "frame-1", text: "Hello", x: 30, y: 10, width: 60, height: 24 },
    ]);
    const selection = createSelection({});
    const opsApi = createEngineNodeOps({
      getDoc: () => doc, setDoc: (next) => { doc = next; }, selection,
      cache: {}, releaseNodeTextures: () => {}, maskTools: {}, paintTools: {}, penTools: {},
      getEffectiveNode: (n) => n, requestRender: () => {}, notify: () => {}, getZoom: () => 1,
    });

    selection.selectNodes(["path-1"]);
    expect(opsApi.typeOnSelectedPath()).toBe(true);
    const createdTextId = selection.getId();
    expect(createdTextId).not.toBe("path-1");
    expect(get(doc, createdTextId).parentId).toBe("frame-1");

    selection.selectNodes(["txt-1", "path-1"]);
    expect(opsApi.attachTextToPath()).toBe(true);
    expect(selection.getIds()).toEqual(["txt-1"]);
    expect(opsApi.detachTextFromPath()).toBe(true);
    expect(get(doc, "txt-1").textPath).toBeUndefined();
  });
  it("respects baseWidth/baseHeight scaling when expanding stroke on a resized open path", () => {
    const resizedOpenPath = {
      id: "open-scaled", kind: "path", pen: true,
      x: 10, y: 20, width: 200, height: 40, baseWidth: 100, baseHeight: 20,
      stroke: "#ff0000", strokeWidth: 10, strokeCap: "butt",
      points: [{ x: 0, y: 10 }, { x: 100, y: 10 }],
    };
    const expanded = expandStrokeToPathNode(resizedOpenPath);
    expect(expanded.width).toBeCloseTo(200, 1);
    expect(expanded.x).toBeCloseTo(10, 1);
  });
});

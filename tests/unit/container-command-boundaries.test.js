import { describe, expect, it } from "vitest";
import { insertGroup, ungroupNodes } from "../../src/canvas/editor/doc_ops_groups.js";
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
});

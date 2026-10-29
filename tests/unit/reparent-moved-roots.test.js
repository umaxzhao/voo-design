import { describe, expect, it } from "vitest";
import { reparentMovedRoots } from "../../src/canvas/editor/reparent-moved-roots.js";
import { moveGestureIds } from "../../src/canvas/editor/move_gesture.js";
import { moveAffectedIds } from "../../src/canvas/editor/doc_ops.js";

const frame = (id, x = 0, patch = {}) => ({ id, kind: "group", isFrame: true, visible: true,
  x, y: 0, width: 200, height: 200, ...patch });
const node = (id, parentId, patch = {}) => ({ id, kind: "rect", visible: true,
  x: 40, y: 40, width: 40, height: 40, parentId, ...patch });
const document = nodes => ({ isCanvasRoot: true, width: 600, height: 400, nodes });
const origins = ids => ids.map(id => ({ id }));
const parentOf = (doc, id) => doc.nodes.find(entry => entry.id === id)?.parentId ?? null;

describe("reparentMovedRoots", () => {
  it("keeps a moved Frame's complete hierarchy even over an equal-size Frame", () => {
    const doc = document([frame("old"), frame("moved", 30),
      node("group", "moved", { kind: "group" }), node("child", "group")]);
    const before = JSON.stringify(doc);
    expect(reparentMovedRoots(doc, origins(["moved", "group", "child"]))).toBe(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("reparents a moved ordinary Group once without flattening nested children", () => {
    const doc = document([frame("source"), frame("target", 300),
      node("group", "source", { kind: "group", x: 340 }),
      node("inner", "group", { kind: "group", x: 350 }), node("child", "inner", { x: 360 })]);
    const before = JSON.stringify(doc);
    const next = reparentMovedRoots(doc, origins(["group", "inner", "child"]));
    expect(parentOf(next, "group")).toBe("target");
    expect(parentOf(next, "inner")).toBe("group");
    expect(parentOf(next, "child")).toBe("inner");
    expect(JSON.stringify(doc)).toBe(before);
    expect(next.nodes.find(entry => entry.id === "child").x).toBe(360);
  });

  it("does not treat the moving unit's own nested Frame as a drop target", () => {
    const doc = document([frame("target", 300),
      node("group", null, { kind: "group", x: 340 }),
      frame("nested", 340, { width: 60, height: 60, parentId: "group" }),
      node("child", "nested", { x: 350 })]);
    const next = reparentMovedRoots(doc, origins(["group", "nested", "child"]));
    expect(parentOf(next, "group")).toBe("target");
    expect(parentOf(next, "nested")).toBe("group");
    expect(parentOf(next, "child")).toBe("nested");
  });

  it("still reparents an independently moved child into another Frame", () => {
    const doc = document([frame("source"), frame("target", 300), node("child", "source", { x: 340 })]);
    expect(parentOf(reparentMovedRoots(doc, origins(["child"])), "child")).toBe("target");
  });

  it("detaches an independently moved child when it leaves every Frame", () => {
    const doc = document([frame("source"), node("child", "source", { y: 300 })]);
    expect(parentOf(reparentMovedRoots(doc, origins(["child"])), "child")).toBe(null);
    expect(reparentMovedRoots({ ...doc, isCanvasRoot: false }, origins(["child"])).nodes).toBe(doc.nodes);
  });
});

describe("complete Group move capture", () => {
  const doc = document([node("group", null, { kind: "group" }),
    node("inner", "group", { kind: "group" }), node("child", "inner")]);
  const api = value => ({ getSelectedGroup: () => value.nodes[0],
    expandMoveSet: ids => moveAffectedIds(value, ids) });

  it("captures the selected Group root and nested metadata with its selected leaf", () => {
    expect(moveGestureIds(api(doc), doc, [doc.nodes[2]])).toEqual(["group", "inner", "child"]);
  });

  it("keeps an exact child selection independent of ordinary ancestors", () => {
    expect(moveGestureIds({ ...api(doc), getSelectedGroup: () => null }, doc, [doc.nodes[2]])).toEqual(["child"]);
  });

  it.each([["group", "locked"], ["group", "lockPosition"], ["child", "locked"], ["child", "lockPosition"]])(
    "refuses a partial Group move when %s has %s", (id, flag) => {
      const locked = { ...doc, nodes: doc.nodes.map(n => n.id === id ? { ...n, [flag]: true } : n) };
      expect(moveGestureIds(api(locked), locked, [locked.nodes[2]])).toEqual([]);
    },
  );
});

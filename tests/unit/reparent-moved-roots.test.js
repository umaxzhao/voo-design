import { describe, expect, it, vi } from "vitest";
import { reparentMovedRoots, REPARENT_HYSTERESIS } from "../../src/canvas/editor/reparent-moved-roots.js";
import { moveGestureIds } from "../../src/canvas/editor/move_gesture.js";
import { moveAffectedIds } from "../../src/canvas/editor/doc_ops.js";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";

const frame = (id, x = 0, patch = {}) => ({ id, kind: "group", isFrame: true, visible: true,
  x, y: 0, width: 200, height: 200, ...patch });
const node = (id, parentId, patch = {}) => ({ id, kind: "rect", visible: true,
  x: 40, y: 40, width: 40, height: 40, parentId, ...patch });
const document = nodes => ({ isCanvasRoot: true, width: 600, height: 400, nodes });
const origins = ids => ids.map(id => ({ id }));
const parentOf = (doc, id) => doc.nodes.find(entry => entry.id === id)?.parentId ?? null;

describe("reparentMovedRoots", () => {
  it("exports REPARENT_HYSTERESIS as 12", () => {
    expect(REPARENT_HYSTERESIS).toBe(12);
  });

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

  it("中心在旧父内缩边界内时不脱离", () => {
    // source: [0, 200] x [0, 200], target: [100, 300] x [0, 200] (target is frontmost).
    // child center at (105, 60). Inside source inset [12, 188] x [12, 188].
    // Even though target is in front and contains (105, 60), child stays in source.
    const doc = document([
      frame("source"),
      frame("target", 100),
      node("child", "source", { x: 85, y: 40, width: 40, height: 40 }),
    ]);
    const next = reparentMovedRoots(doc, origins(["child"]));
    expect(parentOf(next, "child")).toBe("source");
  });

  it("中心在新 Frame 内缩边界外时不吸附（略进入但不足边距）", () => {
    // target: [300, 500] x [0, 200]. Inset boundary x is [312, 488].
    // moving center at (305, 60): 5px inside target outer boundary, but outside 12px inset.
    const shallowDoc = document([
      frame("target", 300),
      node("moving", null, { x: 285, y: 40, width: 40, height: 40 }),
    ]);
    const shallow = reparentMovedRoots(shallowDoc, origins(["moving"]));
    expect(parentOf(shallow, "moving")).toBe(null);

    // When center moves past the 12px hysteresis margin: center at (320, 60) in [312, 488].
    const deepDoc = document([
      frame("target", 300),
      node("moving", null, { x: 300, y: 40, width: 40, height: 40 }),
    ]);
    const deep = reparentMovedRoots(deepDoc, origins(["moving"]));
    expect(parentOf(deep, "moving")).toBe("target");
  });

  it("保持原父级当进入新 Frame 不足边距且中心仍在旧父内", () => {
    // source: [0, 200], target: [200, 400] (adjacent frames).
    // child from source moved so center is at x = 205 (5px into target, < 12px margin).
    const doc = document([
      frame("source", 0),
      frame("target", 200),
      node("child", "source", { x: 185, y: 40, width: 40, height: 40 }),
    ]);
    const next = reparentMovedRoots(doc, origins(["child"]));
    expect(parentOf(next, "child")).toBe("source");
  });
});

describe("reparent modifier key freeze", () => {
  it("修饰键冻结不改变 parentId (ctrlKey)", () => {
    const doc = document([frame("source"), frame("target", 300), node("child", "source", { x: 340 })]);
    let currentDoc = doc;
    const api = {
      getDocument: () => currentDoc,
      setDoc: vi.fn(d => { currentDoc = d; }),
      commit: vi.fn(),
    };
    const { finishGesture } = createPointerFinishDispatcher({ api });
    finishGesture({ ctrlKey: true }, {
      kind: "move", moved: true, origins: [{ id: "child" }],
    });
    expect(api.setDoc).not.toHaveBeenCalled();
    expect(parentOf(currentDoc, "child")).toBe("source");
  });

  it("修饰键冻结不改变 parentId (metaKey / Cmd)", () => {
    const doc = document([frame("source"), frame("target", 300), node("child", "source", { x: 340 })]);
    let currentDoc = doc;
    const api = {
      getDocument: () => currentDoc,
      setDoc: vi.fn(d => { currentDoc = d; }),
      commit: vi.fn(),
    };
    const { finishGesture } = createPointerFinishDispatcher({ api });
    finishGesture({ metaKey: true }, {
      kind: "move", moved: true, origins: [{ id: "child" }],
    });
    expect(api.setDoc).not.toHaveBeenCalled();
    expect(parentOf(currentDoc, "child")).toBe("source");
  });

  it("normal gesture without modifier key performs reparenting", () => {
    const doc = document([frame("source"), frame("target", 300), node("child", "source", { x: 340 })]);
    let currentDoc = doc;
    const api = {
      getDocument: () => currentDoc,
      setDoc: vi.fn(d => { currentDoc = d; }),
      commit: vi.fn(),
    };
    const { finishGesture } = createPointerFinishDispatcher({ api });
    finishGesture({}, {
      kind: "move", moved: true, origins: [{ id: "child" }],
    });
    expect(api.setDoc).toHaveBeenCalled();
    expect(parentOf(currentDoc, "child")).toBe("target");
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


describe("atomic Frame and clipping moves", () => {
  it.each(["locked", "lockPosition"])("rejects a multi-Frame move with a %s descendant", flag => {
    const doc = document([frame("a"), node("child", "a", { [flag]: true }), frame("b", 400), node("peer", "b")]);
    const api = { getSelectedGroup: () => null, expandMoveSet: ids => moveAffectedIds(doc, ids) };
    expect(moveGestureIds(api, doc, [doc.nodes[0], doc.nodes[2]])).toEqual([]);
    expect(moveGestureIds(api, doc, [doc.nodes[0]])).toEqual([]);
  });

  it("does not abandon a locked clipping follower when moving its selected base", () => {
    const doc = document([node("base"), node("follower", null, { clipTo: "base", locked: true })]);
    const api = { getSelectedGroup: () => null, expandMoveSet: ids => moveAffectedIds(doc, ids) };
    expect(moveGestureIds(api, doc, [doc.nodes[0]])).toEqual([]);
  });
});

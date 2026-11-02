import { describe, it, expect, vi } from "vitest";
import { createPointerFinishDispatcher } from "../../src/canvas/editor/editor_pointer_finish.js";
import { createAnnotations } from "../../src/canvas/editor/editor_annotations.js";
import { createDocument, createTextNode } from "../../src/canvas/editor/scene_model.js";
import * as ops from "../../src/canvas/editor/doc_ops.js";

describe("text placement history", () => {
  function setup() {
    let doc = createDocument(1440, 900);
    const snapshots = [doc];
    const setDoc = (next, options) => { doc = next; if (options?.commit !== false) snapshots.push(doc); };
    const annotations = createAnnotations({ getDoc: () => doc, setDoc, select: vi.fn(), notify: vi.fn(), requestRender: vi.fn() });
    const node = createTextNode({ x: 30, y: 40, text: "" });
    setDoc(ops.addNode(doc, node), { commit: false });
    const commit = vi.fn(() => snapshots.push(doc));
    const api = { ...annotations.api, commit, select: vi.fn(), setTool: vi.fn() };
    const gestures = createPointerFinishDispatcher({ api });
    gestures.finishGesture({}, { kind: "text", id: node.id });
    return { annotations, node, snapshots, commit, getDoc: () => doc };
  }
  it("commits placement and typing together, so undo returns to the empty canvas", () => {
    const s = setup();
    expect(s.commit).not.toHaveBeenCalled();
    s.annotations.api.updateTextEdit("Hello");
    s.annotations.api.endTextEdit("Hello");
    expect(s.commit).toHaveBeenCalledOnce();
    expect(s.snapshots).toHaveLength(2);
    expect(JSON.stringify(s.snapshots[1])).toContain("Hello");
    expect(JSON.stringify(s.snapshots[0])).not.toContain(s.node.id);
  });
  it.each(["", undefined])("removes empty placement on Escape or tool exit (%s)", (value) => {
    const s = setup();
    s.annotations.api.endTextEdit(value);
    expect(JSON.stringify(s.getDoc())).not.toContain(s.node.id);
    expect(s.commit).not.toHaveBeenCalled();
    for (const doc of s.snapshots) expect(JSON.stringify(doc)).not.toContain(s.node.id);
  });
  it("commits populated text when leaving through a tool switch", () => {
    const s = setup();
    s.annotations.api.updateTextEdit("Typed before switching");
    s.annotations.api.endTextEdit();
    expect(s.commit).toHaveBeenCalledOnce();
  });
});

describe("existing text edit boundaries", () => {
  function setup() {
    const node = createTextNode({ x: 30, y: 40, text: "Existing" });
    let doc = { ...createDocument(600, 400), nodes: [node] };
    const setDoc = vi.fn((next) => { doc = next; });
    const { api } = createAnnotations({ getDoc: () => doc, setDoc, select: vi.fn(), notify: vi.fn(), requestRender: vi.fn() });
    api.beginTextEdit(node.id);
    return { api, node, setDoc, doc: () => doc };
  }
  it("keeps an untouched edit and an identical update completely mutation-free", () => {
    const f = setup(), before = f.doc();
    f.api.updateTextEdit("Existing"); f.api.endTextEdit("Existing");
    expect(f.setDoc).not.toHaveBeenCalled(); expect(f.doc()).toBe(before);
  });
  it("commits updated text when a tool closes the overlay without an argument", () => {
    const f = setup(); f.api.updateTextEdit("Updated"); f.api.endTextEdit();
    expect(f.doc().nodes[0].text).toBe("Updated");
    expect(f.setDoc.mock.calls.filter(([, options]) => options?.commit !== false)).toHaveLength(1);
  });
  it("deletes an existing text deliberately emptied before a tool switch", () => {
    const f = setup(); f.api.updateTextEdit(""); f.api.endTextEdit();
    expect(f.doc().nodes).toHaveLength(0);
    expect(f.setDoc.mock.calls.filter(([, options]) => options?.commit !== false)).toHaveLength(1);
  });
  it("does not publish a temporary edit that returns to its original text", () => {
    const f = setup(); f.api.updateTextEdit("Temporary"); f.api.updateTextEdit("Existing"); f.api.endTextEdit();
    expect(f.setDoc.mock.calls.every(([, options]) => options?.commit === false)).toBe(true);
  });
});

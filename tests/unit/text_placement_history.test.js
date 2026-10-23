import { describe, it, expect, vi } from "vitest";
import { createShapesPointerGestures } from "../../src/canvas/editor/editor_pointer_shapes.js";
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
    const gestures = createShapesPointerGestures({ api });
    gestures.finishText({}, { id: node.id });
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

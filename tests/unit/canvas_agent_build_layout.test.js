import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_TOOL_SCHEMAS, executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";
import { measureText } from "../../src/canvas/editor/text_metrics.js";
import { documentToSvg } from "../../src/canvas/editor/editor_svg.js";

const node = (type = "rect", extra = {}) => ({ type, name: type, x: 100, y: 200, width: 240, height: 80, ...extra });

describe("build_layout", () => {
  let doc, editor, history, measured;
  beforeEach(() => {
    globalThis.window ??= new EventTarget();
    doc = { nodes: [] };
    history = createHistory();
    history.reset({ doc: JSON.stringify(doc) });
    const ctx = { save() {}, restore() {}, measureText: vi.fn(text => ({ width: text.length * 8 })) };
    measured = vi.fn(n => measureText(ctx, n));
    // Mirror the editor's setDoc measurement boundary, using real drawing helpers,
    // text metrics and history. No browser is needed.
    const setDoc = (next, { commit = true } = {}) => {
      doc = { ...next, nodes: next.nodes.map(n => n.kind === "text" ? { ...n, ...measured(n) } : n) };
      if (commit) history.push({ doc: JSON.stringify(doc) });
    };
    editor = {
      ...createDrawingShapesApi({ getDoc: () => doc, setDoc, selectMany: vi.fn() }),
      getDoc: () => doc,
      getNode: id => doc.nodes.find(n => n.id === id),
      updateNode: vi.fn((id, patch) => setDoc({ ...doc, nodes: doc.nodes.map(n => n.id === id ? { ...n, ...patch } : n) })),
      beginBatch: vi.fn(() => history.beginBatch()),
      endBatch: vi.fn(() => history.endBatch()),
      commitEditorDocument: vi.fn(() => history.push({ doc: JSON.stringify(doc) })),
    };
    window.__vooEditor = editor;
  });

  it("registers its recursive schema and documents absolute coordinates", () => {
    const schema = CANVAS_TOOL_SCHEMAS.find(s => s.function.name === "build_layout").function;
    expect(schema.description).toContain("absolute canvas coordinates");
    expect(schema.description).toContain("one top-level frame");
    expect(schema.description).toContain("type=text for editable copy");
    expect(schema.description).toContain("path requires SVG d data");
    expect(schema.description).toContain("capture_canvas and inspect_layout");
    expect(schema.parameters.$defs.node.properties.children.items.$ref).toBe("#/$defs/node");
  });

  it("creates nested frames and all shape types with ownership and styles", async () => {
    const result = await executeCanvasTool("build_layout", { nodes: [node("frame", { autoLayout: { layout: "vertical", gap: 12, padding: 16 }, children: [
      node("frame", { name: "Inner", children: [node("text", { text: "Hello", fontSize: 24, color: "#123456" })] }),
      node("ellipse", { fill: "#eee", opacity: 0.5 }), node("line", { width: 50, height: 0, stroke: "#333", strokeWidth: 2 }),
      node("path", { name: "Vector leaf", d: "M 0 0 L 30 10 C 20 30 10 30 0 0 Z", x: 120, y: 220, fill: "#2b7a55" }),
    ] })] });
    expect(result.count).toBe(6);
    expect(result.created.map(n => n.type)).toEqual(["frame", "frame", "text", "ellipse", "line", "path"]);
    const [outer, inner, text, ellipse, line, path] = doc.nodes;
    expect(outer).toMatchObject({ isFrame: true, autoLayout: { direction: "vertical", gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 } } });
    expect(inner).toMatchObject({ parentId: outer.id, x: 100, y: 200 });
    expect(text).toMatchObject({ parentId: inner.id, text: "Hello", fill: "#123456", fontSize: 24 });
    expect(ellipse).toMatchObject({ parentId: outer.id, kind: "ellipse", opacity: 0.5 });
    expect(line).toMatchObject({ parentId: outer.id, kind: "path", stroke: "#333", strokeWidth: 2 });
    expect(path).toMatchObject({ parentId: outer.id, kind: "path", name: "Vector leaf", fill: "#2b7a55" });
    expect(path.points.length).toBeGreaterThanOrEqual(3);
    expect(path.d).toBeUndefined();
    expect(documentToSvg({ isCanvasRoot: true, width: 1440, height: 900, nodes: doc.nodes })).toContain("<path");
    const pathId = path.id;
    const originalX = path.points[0].x;
    await executeCanvasTool("edit_path_nodes", { layerId: pathId, ops: [{ op: "move", index: 0, dx: 5, dy: 3 }] });
    expect(doc.nodes.find(item => item.id === pathId).points[0].x).toBe(originalX + 5);
    expect(JSON.parse(history.undo().doc).nodes.find(item => item.id === pathId).points[0].x).toBe(originalX);
    expect(JSON.parse(history.redo().doc).nodes.find(item => item.id === pathId).points[0].x).toBe(originalX + 5);
  });

  it("measures text with final fonts, wrapping, line height and letter spacing", async () => {
    await executeCanvasTool("build_layout", { nodes: [node("text", { text: "Hello\nWorld", fontSize: 30, fontFamily: "Inter", fontWeight: 700, lineHeight: 1.5, letterSpacing: 2, width: 200, height: 1 })] });
    expect(measured).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello\nWorld", fontSize: 30, fontWeight: 700, fontFamily: "Inter", boxWidth: 200, lineHeight: 1.5, letterSpacing: 2 }));
    expect(doc.nodes[0]).toMatchObject({ width: 200, height: 90 });
  });

  it("adds to an existing parent using absolute coordinates", async () => {
    const parent = await executeCanvasTool("create_frame", node("frame"));
    await executeCanvasTool("build_layout", { parentId: parent.layerId, nodes: [node("rect", { x: 12, y: 24 })] });
    expect(doc.nodes[1]).toMatchObject({ parentId: parent.layerId, x: 12, y: 24 });
  });

  it.each([
    [{ nodes: [] }, /nodes must be a non-empty array/],
    [{ nodes: [node("star")] }, /nodes\[0\].type/],
    [{ nodes: [node("rect", { width: -1 })] }, /width must be non-negative/],
    [{ nodes: [node("rect", { x: NaN })] }, /x must be a finite number/],
    [{ nodes: [node("rect", { children: [node()] })] }, /children requires a frame/],
    [{ nodes: [node("frame", { children: [node("path")] })] }, /d is required for path nodes/],
    [{ nodes: [node("frame", { children: [node("path", { d: "not a path" })] })] }, /\.d is (invalid|must describe at least two path points)/],
    [{ nodes: [node("rect", { d: "M 0 0 L 1 1" })] }, /d is only supported for path nodes/],
    [{ nodes: [node("frame", { autoLayout: { layout: "diagonal" } })] }, /autoLayout.layout/],
    [{ nodes: [node("text", { fontSize: 0 })] }, /fontSize must be positive/],
    [{ nodes: [node("rect", { opacity: 2 })] }, /opacity/],
    [{ nodes: [node("rect", { shadow: { blur: "bad" } })] }, /shadow.blur/],
    [{ parentId: "missing", nodes: [node()] }, /parentId.*not found/],
    [{ nodes: [node("frame", { children: Array.from({ length: 200 }, () => node()) })] }, /at most 200/],
    [{ nodes: [node(), node("text", { text: 12 })] }, /text must be a string/],
  ])("rejects invalid input before any writes: %j", async (args, message) => {
    await expect(executeCanvasTool("build_layout", args)).rejects.toThrow(message);
    expect(doc.nodes).toHaveLength(0);
    expect(editor.beginBatch).not.toHaveBeenCalled();
  });

  it("creates exactly one undo entry and restores the whole tree with redo", async () => {
    await executeCanvasTool("build_layout", { nodes: [node("frame", { children: [node(), node("text", { text: "Done" })] })] });
    expect(editor.beginBatch).toHaveBeenCalledOnce();
    expect(editor.endBatch).toHaveBeenCalledOnce();
    expect(editor.commitEditorDocument).toHaveBeenCalledOnce();
    expect(JSON.parse(history.undo().doc).nodes).toEqual([]);
    expect(history.undo()).toBeNull();
    expect(JSON.parse(history.redo().doc).nodes).toHaveLength(3);
  });

  it("batches older hosts through mute", async () => {
    delete editor.beginBatch;
    delete editor.endBatch;
    editor.mute = vi.fn(fn => history.mute(fn));
    await executeCanvasTool("build_layout", { nodes: [node(), node("text", { text: "Done" })] });
    expect(editor.mute).toHaveBeenCalledOnce();
    expect(JSON.parse(history.undo().doc).nodes).toEqual([]);
    expect(history.undo()).toBeNull();
  });

  it("nests inside an agent history batch without committing it prematurely", async () => {
    history.beginBatch();
    await executeCanvasTool("build_layout", { nodes: [node()] });
    expect(history.undo()).toBeNull();
    history.endBatch();
    editor.commitEditorDocument();
    expect(JSON.parse(history.undo().doc).nodes).toEqual([]);
  });
});

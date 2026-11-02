import { describe, expect, it } from "vitest";
import { createFrameClipContext } from "../../src/canvas/editor/frame-clip-context.js";
import { documentToSvg, nodesToSvg } from "../../src/canvas/editor/editor_svg.js";
import { selectedExportBounds, selectedExportNodes } from "../../src/canvas/editor/editor_export_selection.js";

const frame = (id, extra = {}) => ({ id, kind: "group", isFrame: true, visible: true,
  x: 30, y: 40, width: 200, height: 100, fill: "#0000ff", ...extra });
const rect = (id, extra = {}) => ({ id, kind: "rect", visible: true,
  x: 0, y: 0, width: 300, height: 200, fill: "#ff0000", ...extra });
const doc = (nodes) => ({ width: 400, height: 300, isCanvasRoot: true, nodes });

describe("Frame clip ancestry", () => {
  it("resolves later parents through plain folders and excludes the Frame's own boundary", () => {
    const outer = frame("outer"), inner = frame("inner", { parentId: "folder" });
    const folder = { ...frame("folder", { parentId: "outer" }), isFrame: false };
    const child = rect("child", { parentId: "inner" });
    const nodes = [child, inner, folder, outer];
    const clips = createFrameClipContext(nodes);
    expect(clips.framesOf(child)).toEqual([inner, outer]);
    expect(clips.framesOf(inner)).toEqual([outer]);
    expect(clips.framesOf(outer)).toEqual([]);
    expect(createFrameClipContext(nodes)).toBe(clips);
  });

  it("bypasses an open Frame while retaining its clipping ancestors", () => {
    const outer = frame("outer"), inner = frame("inner", { parentId: "outer", clipContent: false });
    const child = rect("child", { parentId: "inner" });
    expect(createFrameClipContext([outer, inner, child]).framesOf(child)).toEqual([outer]);
  });

  it("terminates malformed cyclic ancestry without clipping the node against itself", () => {
    const a = frame("a", { parentId: "b" }), b = frame("b", { parentId: "a" });
    expect(createFrameClipContext([a, b]).framesOf(a)).toEqual([b]);
  });

  it("rebuilds clips when a parent changes without replacing its child", () => {
    const parent = frame("parent"), child = rect("child", { parentId: "parent" });
    const original = createFrameClipContext([parent, child]);
    const changed = createFrameClipContext([{ ...parent, width: 80 }, child]);
    expect(original.framesOf(child)[0].width).toBe(200);
    expect(changed.framesOf(child)[0].width).toBe(80);
  });
});

describe("Frame export composition", () => {
  it("keeps empty Frame paint and structural folders in selected export data", () => {
    const empty = frame("empty"), folder = { ...frame("folder", { parentId: "empty" }), isFrame: false };
    const child = rect("child", { parentId: "folder" });
    expect(selectedExportNodes(doc([empty]), [empty.id])).toEqual([empty]);
    expect(selectedExportNodes(doc([empty, folder, child]), [empty.id])).toEqual([empty, folder, child]);
    expect(nodesToSvg([empty])).toContain('fill="#0000ff"');
  });

  it("sizes Group selections by painted children while keeping empty Frame dimensions", () => {
    const folder = { ...frame("folder", { width: 400 }), isFrame: false };
    const child = rect("child", { width: 80, height: 60, parentId: folder.id });
    expect(selectedExportBounds([folder, child])).toEqual({ x: 0, y: 0, width: 80, height: 60 });
    expect(selectedExportBounds([frame("empty")])).toEqual({ x: 30, y: 40, width: 200, height: 100 });
  });

  it("suppresses a mask chain when only its base inherits hidden visibility", () => {
    const hidden = frame("hidden", { visible: false });
    const base = rect("base", { maskBase: true, parentId: hidden.id });
    const member = rect("member", { clipTo: base.id, fill: "#abcdef" });
    expect(documentToSvg(doc([hidden, base, member]))).not.toContain("#abcdef");
  });

  it("uses painted alpha for partially transparent or hidden fills instead of geometry clipping", () => {
    for (const paint of [{ fillOpacity: 0.5 }, { fillHidden: true }]) {
      const base = rect("base", { maskBase: true, ...paint });
      const svg = documentToSvg(doc([base, rect("member", { clipTo: base.id })]));
      expect(svg).toContain('mask-type="alpha"');
      expect(svg).not.toContain('<clipPath');
    }
  });
});

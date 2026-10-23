import { describe, expect, it, vi } from "vitest";
import { createLayoutNode } from "../../src/canvas/agent/canvas_tools_build_layout.js";

function fakeEditor() {
  const nodes = new Map();
  const add = vi.fn(({ x, y }) => {
    const node = { id: `node-${nodes.size}`, x, y };
    nodes.set(node.id, node);
    return node;
  });
  return {
    nodes,
    addFrameAt: add,
    addRectAt: add,
    updateNode: vi.fn((id, patch) => Object.assign(nodes.get(id), patch)),
    commitEditorDocument: vi.fn(),
  };
}
const geometry = { name: "HTML node", x: 0, y: 0, width: 200, height: 100 };

describe("createLayoutNode", () => {
  it.each(["horizontal", "vertical"])("creates a %s frame with HTML padding and reparents its child", direction => {
    const editor = fakeEditor();
    const padding = { top: 8, right: 12, bottom: 16, left: 20 };
    const id = createLayoutNode(editor, {
      ...geometry, type: "frame",
      autoLayout: { direction, gap: "6", crossGap: 10, padding, wrap: true, alignItems: "center", justifyContent: "space-between" },
    });
    expect(editor.nodes.get(id).autoLayout).toMatchObject({ direction, gap: 6, crossGap: 10, padding, wrap: true, alignItems: "center", justifyContent: "space-between" });
    const childId = createLayoutNode(editor, { ...geometry, type: "rect", layoutWidth: "fill", layoutHeight: "hug", layoutPosition: "auto" }, id);
    expect(editor.nodes.get(childId)).toMatchObject({ parentId: id, layoutWidth: "fill", layoutHeight: "hug", layoutPosition: "auto" });
  });

  it("preserves build_layout's scalar padding and layout spelling", () => {
    const editor = fakeEditor();
    const id = createLayoutNode(editor, { ...geometry, type: "frame", autoLayout: { layout: "vertical", gap: 4, padding: 9 } });
    expect(editor.nodes.get(id).autoLayout).toMatchObject({ direction: "vertical", gap: 4, padding: { top: 9, right: 9, bottom: 9, left: 9 } });
  });

  it.each(["frame", "rect"])("strips HTML metadata and applies supported paint opacity to a %s", type => {
    const editor = fakeEditor();
    const metadata = { key: "a", htmlKey: "a", htmlSource: "<div/>", parentKey: "parent", imagePrompt: "photo" };
    const id = createLayoutNode(editor, { ...geometry, type, ...metadata, fillOpacity: 0.3, strokeOpacity: 0.5, layoutPosition: "absolute" });
    expect(editor.nodes.get(id)).toMatchObject({ fillOpacity: 0.3, strokeOpacity: 0.5, layoutPosition: "absolute" });
    for (const { 1: patch } of editor.updateNode.mock.calls) {
      for (const key of Object.keys(metadata)) expect(patch).not.toHaveProperty(key);
    }
    expect(editor.nodes.get(id)).not.toHaveProperty("autoLayout");
  });
});

import { describe, expect, it, vi } from "vitest";
import { applyLayoutPatches } from "../../src/canvas/agent/apply-layout-patches.js";
import { resolveAgentAutoLayout } from "../../src/canvas/agent/resolve-auto-layout.js";
import { validateAutoLayout } from "../../src/canvas/agent/canvas_mutation_validation.js";

describe("agent layout subtree transactions", () => {
  it("moves nested descendants once and commits the whole result once", () => {
    const doc = { nodes: [
      { id: "g", kind: "group", x: 10, y: 20 },
      { id: "nested", kind: "group", parentId: "g", x: 20, y: 30 },
      { id: "child", kind: "rect", parentId: "nested", x: 30, y: 40 },
      { id: "outside", kind: "rect", x: 200, y: 200 },
    ] };
    const editor = { getDocument: () => doc, setDoc: vi.fn() };
    applyLayoutPatches(editor, [
      { id: "g", patch: { x: 100, y: 200 } },
      { id: "child", patch: { x: 300, y: 400 } },
    ], "Align");
    expect(editor.setDoc).toHaveBeenCalledTimes(1);
    expect(editor.setDoc.mock.calls[0][0].nodes.map(({ x, y }) => [x, y]))
      .toEqual([[100, 200], [110, 210], [120, 220], [200, 200]]);
    expect(doc.nodes[2]).toMatchObject({ x: 30, y: 40 });
  });
  it("does not create undo entries for a no-op", () => {
    const editor = { getDocument: () => ({ nodes: [{ id: "a", x: 10, y: 20 }] }), setDoc: vi.fn() };
    expect(applyLayoutPatches(editor, [{ id: "a", patch: { x: 10 } }], "Align")).toBe(0);
    expect(editor.setDoc).not.toHaveBeenCalled();
  });
  it("turns disabled auto layout into the scene's null state", () => {
    expect(resolveAgentAutoLayout({ autoLayout: { direction: "vertical" } }, { enabled: false })).toBeNull();
  });
  it("preserves existing sizing and direction when changing only alignment", () => {
    expect(resolveAgentAutoLayout({ autoLayout: { direction: "vertical", widthMode: "hug", gap: 24 } },
      { enabled: true, alignment: "center" }))
      .toMatchObject({ direction: "vertical", widthMode: "hug", gap: 24, alignItems: "center" });
  });
  it("maps main-axis distribution without overwriting cross-axis alignment", () => {
    expect(resolveAgentAutoLayout({ autoLayout: { alignItems: "end" } },
      { enabled: true, alignment: "space-between" }))
      .toMatchObject({ direction: "horizontal", alignItems: "end", justifyContent: "space-between" });
  });
  it("keeps explicit distribution authoritative without assigning it to the cross axis", () => {
    expect(resolveAgentAutoLayout({ autoLayout: { direction: "vertical", alignItems: "end" } },
      { enabled: true, alignment: "space-between", justifyContent: "center" }))
      .toMatchObject({ direction: "vertical", alignItems: "end", justifyContent: "center" });
  });
  it("rejects stretch rather than silently accepting an unsupported engine mode", () => {
    expect(() => validateAutoLayout({ enabled: true, alignment: "stretch" })).toThrow();
  });
});

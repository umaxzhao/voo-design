import { describe, expect, it, vi } from "vitest";
import { handleEditorDoubleClick } from "../../src/canvas/editor/editor_pointer_events.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

function createApi(hit) {
  return {
    getTool: vi.fn(() => TOOL.SELECT),
    toDocPoint: vi.fn(() => ({ x: 20, y: 30 })),
    nodeAtPoint: vi.fn(() => hit),
    enterGroup: vi.fn(() => true),
    select: vi.fn(),
    beginTextEdit: vi.fn(),
  };
}

describe("canvas text double-click editing", () => {
  it("edits a text layer before trying to enter its parent group", () => {
    const text = { id: "nested-title", kind: "text" };
    const api = createApi(text);

    handleEditorDoubleClick(
      { clientX: 20, clientY: 30 },
      { api },
    );

    expect(api.select).toHaveBeenCalledWith(text.id);
    expect(api.beginTextEdit).toHaveBeenCalledWith(text.id);
    expect(api.enterGroup).not.toHaveBeenCalled();
  });

  it("still enters a parent group when double-clicking a non-text child", () => {
    const shape = { id: "nested-shape", kind: "rect" };
    const api = createApi(shape);

    handleEditorDoubleClick(
      { clientX: 20, clientY: 30 },
      { api },
    );

    expect(api.enterGroup).toHaveBeenCalledWith(shape.id);
    expect(api.beginTextEdit).not.toHaveBeenCalled();
  });
});

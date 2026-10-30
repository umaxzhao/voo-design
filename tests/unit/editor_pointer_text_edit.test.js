import { describe, expect, it, vi } from "vitest";
import { handleEditorDoubleClick } from "../../src/canvas/editor/editor_pointer_events.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

function createApi(hit) {
  return {
    getTool: vi.fn(() => TOOL.SELECT),
    toDocPoint: vi.fn(() => ({ x: 20, y: 30 })),
    nodeAtPoint: vi.fn(() => hit),
    enterGroup: vi.fn(() => true),
    selectExactly: vi.fn(),
    beginTextEdit: vi.fn(),
    beginEdit: vi.fn(),
    convertSelectedToPath: vi.fn(() => true),
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

    expect(api.selectExactly).toHaveBeenCalledWith([text.id]);
    expect(api.beginTextEdit).toHaveBeenCalledWith(text.id);
    expect(api.enterGroup).not.toHaveBeenCalled();
  });

  it("still isolates containers when double-clicking their surface", () => {
    const shape = { id: "folder", kind: "group" };
    const api = createApi(shape);

    handleEditorDoubleClick(
      { clientX: 20, clientY: 30 },
      { api },
    );

    expect(api.enterGroup).toHaveBeenCalledWith(shape.id);
    expect(api.beginTextEdit).not.toHaveBeenCalled();
  });
});


describe("canvas vector double-click editing", () => {
  it("edits a nested pen path before trying to enter its parent group", () => {
    const api = createApi({ id: "nested-path", kind: "path", pen: true });
    handleEditorDoubleClick({ clientX: 20, clientY: 30 }, { api });
    expect(api.beginEdit).toHaveBeenCalledWith("nested-path");
    expect(api.selectExactly).toHaveBeenCalledWith(["nested-path"]);
    expect(api.enterGroup).not.toHaveBeenCalled();
    expect(api.convertSelectedToPath).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "rect" }, { kind: "ellipse" }, { kind: "path", poly: true },
    { kind: "path", line: true }, { kind: "path", arrow: true },
  ])("converts $kind to anchors before entering a parent group", (shape) => {
    const api = createApi({ ...shape, id: "shape" });
    handleEditorDoubleClick({ clientX: 20, clientY: 30 }, { api });
    expect(api.convertSelectedToPath).toHaveBeenCalledWith("shape");
    expect(api.beginEdit).toHaveBeenCalledWith("shape");
    expect(api.selectExactly).toHaveBeenCalledWith(["shape"]);
    expect(api.enterGroup).not.toHaveBeenCalled();
  });

  it("does not begin a path session when conversion refuses the target", () => {
    const api = createApi({ id: "shape", kind: "rect" });
    api.convertSelectedToPath.mockReturnValue(false);
    handleEditorDoubleClick({ clientX: 20, clientY: 30 }, { api });
    expect(api.beginEdit).not.toHaveBeenCalled();
  });
});

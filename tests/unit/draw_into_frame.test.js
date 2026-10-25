// Drawing inside a frame must land a child in that frame (Figma/Pen
// behaviour), including a frame drawn inside a frame.
import { describe, expect, it, vi } from "vitest";
import { frameAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { createDocument } from "../../src/canvas/editor/scene_model.js";
import { createGroupNode } from "../../src/canvas/editor/scene_model_groups.js";
import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";

function frameNode({ id = "frame", x, y, width, height, extra = {} }) {
  return {
    ...createGroupNode({ x, y, width, height }),
    id,
    frame: true,
    isFrame: true,
    ...extra,
  };
}

function docWith(nodes) {
  return { ...createDocument(1600, 1000), nodes };
}

function drawingApi(initialDoc) {
  let doc = initialDoc;
  const api = createDrawingShapesApi({
    getDoc: () => doc,
    setDoc: (next) => {
      doc = next;
    },
    selectMany: () => {},
    getColor: () => "#ffffff",
  });
  return { api, getDoc: () => doc };
}

describe("frameAtPoint", () => {
  const outer = frameNode({ id: "outer", x: 100, y: 100, width: 400, height: 300 });
  const inner = frameNode({ id: "inner", x: 150, y: 150, width: 120, height: 80 });

  it("returns the innermost frame under the point", () => {
    const doc = docWith([outer, inner]);
    expect(frameAtPoint(doc, { x: 160, y: 160 }).id).toBe("inner");
    expect(frameAtPoint(doc, { x: 300, y: 300 }).id).toBe("outer");
    expect(frameAtPoint(doc, { x: 900, y: 900 })).toBeNull();
  });

  it("skips hidden and locked frames", () => {
    const doc = docWith([
      frameNode({ id: "hidden", x: 0, y: 0, width: 500, height: 500, extra: { visible: false } }),
      frameNode({ id: "locked", x: 0, y: 0, width: 500, height: 500, extra: { locked: true } }),
    ]);
    expect(frameAtPoint(doc, { x: 10, y: 10 })).toBeNull();
  });

  it("ignores a hidden parent frame's children", () => {
    const doc = docWith([
      frameNode({ id: "outer", x: 0, y: 0, width: 500, height: 500, extra: { visible: false } }),
      frameNode({ id: "inner", x: 20, y: 20, width: 100, height: 100, extra: { parentId: "outer" } }),
    ]);
    expect(frameAtPoint(doc, { x: 30, y: 30 })).toBeNull();
  });
});

describe("frame tool inside a frame", () => {
  it("creates the new frame as a child of the frame the drag starts in", () => {
    const host = frameNode({ id: "host", x: 100, y: 100, width: 400, height: 300 });
    const { api, getDoc } = drawingApi(docWith([host]));

    const child = api.addFrameAt({ x: 180, y: 200 }, { intoFrame: true });

    expect(child.parentId).toBe("host");
    expect(getDoc().nodes.find((node) => node.id === child.id).parentId).toBe(
      "host",
    );
  });

  it("keeps a frame drawn outside any frame at the document root", () => {
    const host = frameNode({ id: "host", x: 100, y: 100, width: 400, height: 300 });
    const { api, getDoc } = drawingApi(docWith([host]));

    const root = api.addFrameAt({ x: 900, y: 800 }, { intoFrame: true });

    expect(root.parentId).toBeNull();
    expect(getDoc().nodes.find((node) => node.id === root.id).parentId).toBeNull();
  });

  it("nests into the innermost frame when frames are nested", () => {
    const outer = frameNode({ id: "outer", x: 100, y: 100, width: 400, height: 300 });
    const inner = frameNode({ id: "inner", x: 150, y: 150, width: 120, height: 80 });
    const { api } = drawingApi(docWith([outer, inner]));

    const child = api.addFrameAt({ x: 170, y: 170 }, { intoFrame: true });

    expect(child.parentId).toBe("inner");
  });
});

describe("shapes and text drawn inside a frame", () => {
  it("keeps programmatic creation at the root unless the tool opts in", () => {
    const host = frameNode({ id: "host", x: 100, y: 100, width: 400, height: 300 });
    const { api } = drawingApi(docWith([host]));

    // The agent/tools path passes an explicit parent later; it must not be
    // silently re-parented by the interactive drawing heuristic.
    expect(api.addRectAt({ x: 120, y: 120 }).parentId ?? null).toBeNull();
    expect(api.addFrameAt({ x: 120, y: 120 }).parentId ?? null).toBeNull();
  });

  it("parents a rectangle, an ellipse and a text box to the host frame", () => {
    const host = frameNode({ id: "host", x: 100, y: 100, width: 400, height: 300 });
    const { api } = drawingApi(docWith([host]));

    expect(api.addRectAt({ x: 120, y: 120 }, { intoFrame: true }).parentId).toBe("host");
    expect(api.addEllipseAt({ x: 140, y: 140 }, { intoFrame: true }).parentId).toBe("host");
    expect(api.addTextAt({ x: 160, y: 160 }, "Hi", { intoFrame: true }).parentId).toBe("host");
  });
});

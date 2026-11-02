import { describe, it, expect } from "vitest";
import { nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { createTransformPointerGestures } from "../../src/canvas/editor/editor_pointer_transform.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

describe("Selection & Transform Ergonomics (Figma + Photoshop Parity)", () => {
  it("nodeAtPoint hit-tests thin line strokes within tolerance slop", () => {
    const verticalLine = {
      id: "line-v",
      kind: NODE_KIND.PATH,
      x: 100,
      y: 50,
      width: 0,
      height: 200,
      strokeWidth: 2,
      visible: true,
    };
    const doc = { nodes: [verticalLine] };

    // Exact hit
    expect(nodeAtPoint(doc, { x: 100, y: 100 })?.id).toBe("line-v");
    // Near hit 3px away within slop
    expect(nodeAtPoint(doc, { x: 103, y: 100 })?.id).toBe("line-v");
    expect(nodeAtPoint(doc, { x: 97, y: 100 })?.id).toBe("line-v");
    // Far hit 20px away outside slop
    expect(nodeAtPoint(doc, { x: 120, y: 100 })).toBeNull();
  });

  it("startSelectDrag falls through to select target on first click when exiting pen edit mode", () => {
    const calls = [];
    let editing = true;
    const targetNode = {
      id: "rect-1",
      kind: NODE_KIND.RECT,
      x: 200,
      y: 200,
      width: 100,
      height: 100,
      visible: true,
    };
    let selected = null;
    const api = {
      toDocPoint: (cx, cy) => ({ x: cx, y: cy }),
      getDocument: () => ({ nodes: [targetNode] }),
      getViewport: () => ({ zoom: 1 }),
      getSelected: () => selected,
      getSelectedNodes: () => (selected ? [selected] : []),
      getSelectedIds: () => (selected ? [selected.id] : []),
      getTool: () => "select",
      isSelected: (id) => selected?.id === id,
      isEditing: () => editing,
      endEdit: () => {
        calls.push("endEdit");
        editing = false;
      },
      editDown: () => false, // click not on anchor/handle
      nodeAtPoint: (pt) => (pt.x >= 200 && pt.x <= 300 && pt.y >= 200 && pt.y <= 300 ? targetNode : null),
      select: (id) => {
        calls.push(`select:${id}`);
        selected = targetNode;
      },
      getSelectionTransform: () => null,
      getPixelSelection: () => null,
    };
    let gesture = null;
    const transform = createTransformPointerGestures({
      api,
      stage: { style: { cursor: "" } },
      screenPoint: (e) => ({ x: e.clientX, y: e.clientY }),
      nodeHandleUnder: () => null,
      rotateHandleUnder: () => false,
      rectRadiusHandleUnder: () => false,
      gradientControlGrab: () => null,
      pointInContours: () => false,
      penEditPress: () => {},
      getGesture: () => gesture,
      setGesture: (g) => { gesture = g; },
    });

    transform.startSelectDrag({ clientX: 250, clientY: 250 });
    expect(calls).toContain("endEdit");
    expect(calls).toContain("select:rect-1");
    expect(gesture?.kind).toBe("move");
  });
});

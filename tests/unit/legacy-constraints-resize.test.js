import { describe, expect, it } from "vitest";
import { resizeDocumentEdges, setDocumentSize } from "../../src/canvas/editor/doc_ops_canvas.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";
import { reflowConstraints } from "../../src/canvas/editor/scene_constraints.js";

const constrainedDoc = () => ({
  width: 200,
  height: 100,
  nodes: [{
    id: "child",
    kind: "rect",
    x: 140,
    y: 60,
    width: 40,
    height: 30,
    constraints: { horizontal: "right", vertical: "bottom" },
  }],
});

describe("constraint resize effects through document resize operations", () => {
  it("pins a right/bottom child when the exact-size engine operation grows the page", () => {
    const next = setDocumentSize(constrainedDoc(), 300, 150);
    expect(next.nodes[0]).toMatchObject({ x: 240, y: 110, width: 40, height: 30 });
  });

  it("pins a right/bottom child when the canvas edge drag grows the page", () => {
    const next = resizeDocumentEdges(constrainedDoc(), { right: true, bottom: true }, 100, 50);
    expect(next.nodes[0]).toMatchObject({ x: 240, y: 110, width: 40, height: 30 });
  });

  it("shows that the dedicated reflow operation computes the expected geometry", () => {
    const doc = constrainedDoc();
    const next = reflowConstraints(doc, {
      parentId: null,
      oldBox: { x: 0, y: 0, width: 200, height: 100 },
      newBox: { x: 0, y: 0, width: 300, height: 150 },
    });
    expect(next.nodes[0]).toMatchObject({ x: 240, y: 110, width: 40, height: 30 });
  });

  it("reflows auto-layout children when their parent dimensions change", () => {
    const doc = {
      width: 500,
      height: 500,
      nodes: [
        { id: "frame", kind: "group", x: 0, y: 0, width: 200, height: 100,
          autoLayout: { direction: "horizontal", gap: 10, padding: 10, alignItems: "center", justifyContent: "start", widthMode: "fixed", heightMode: "fixed" } },
        { id: "a", kind: "rect", parentId: "frame", x: 10, y: 10, width: 40, height: 20, layoutWidth: "fixed", layoutHeight: "fixed" },
        { id: "b", kind: "rect", parentId: "frame", x: 60, y: 10, width: 40, height: 20, layoutWidth: "fixed", layoutHeight: "fixed" },
      ],
    };
    const resized = { ...doc, nodes: doc.nodes.map((node) => node.id === "frame" ? { ...node, width: 300 } : node) };
    const next = reflowAutoLayout(resized);
    expect(next.nodes.find((node) => node.id === "b")).toMatchObject({ x: 60, y: 40, width: 40, height: 20 });
  });
});

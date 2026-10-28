import { describe, expect, it } from "vitest";
import { resizeDocumentEdges, updateNode } from "../../src/canvas/editor/doc_ops.js";
import { createDocument } from "../../src/canvas/editor/scene_model.js";
import { resolveCornerRadii } from "../../src/canvas/editor/scene_model_core.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";

function constrainedDocument() {
  const doc = createDocument(200, 100, "transparent");
  doc.nodes = [{
    id: "corner-child",
    kind: "rect",
    x: 150,
    y: 70,
    width: 40,
    height: 20,
    constraints: { horizontal: "right", vertical: "bottom" },
  }];
  return doc;
}

describe("right properties panel document effects", () => {
  it("persists constraint values written by the panel edit path", () => {
    const doc = constrainedDocument();
    const next = updateNode(doc, "corner-child", {
      constraints: { horizontal: "right", vertical: "bottom" },
    });
    expect(next.nodes[0].constraints).toEqual({ horizontal: "right", vertical: "bottom" });
  });

  it.fails("reflows right/bottom constrained children when the canvas size drag grows the page", () => {
    const doc = constrainedDocument();
    const resized = resizeDocumentEdges(doc, { right: true, bottom: true }, 100, 50);

    // Keep the child's right and bottom offsets (10px and 10px) from the new edges.
    expect(resized.nodes[0]).toMatchObject({ x: 250, y: 120, width: 40, height: 20 });
  });

  it("resolves per-corner radii into the geometry consumed by rendering", () => {
    const radii = resolveCornerRadii(
      { tl: 4, tr: 8, br: 12, bl: 16 },
      100,
      80,
    );
    expect(radii).toMatchObject({ tl: 4, tr: 8, br: 12, bl: 16 });
  });

  it("maps panel text and paint fields into the Skia render input", () => {
    const element = elementFor({
      id: "styled",
      kind: "text",
      x: 2,
      y: 3,
      width: 120,
      height: 30,
      text: "Audit",
      fontFamily: "Inter",
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: 1,
      fill: "#123456",
      opacity: 0.5,
    }, 0, 0, 0, () => null, null);
    expect(element).toMatchObject({
      text: "Audit",
      fontFamily: "Inter",
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: 1,
    });
  });

  it.fails("passes the panel italic field through the Skia text render input", () => {
    const element = elementFor({
      id: "italic",
      kind: "text",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      text: "Italic",
      fontFamily: "Inter",
      fontSize: 16,
      italic: true,
    }, 0, 0, 0, () => null, null);
    expect(element).toHaveProperty("italic", true);
  });
});

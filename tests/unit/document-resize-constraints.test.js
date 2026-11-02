import { describe, expect, it } from "vitest";
import { resizeDocumentEdges, setDocumentSize } from "../../src/canvas/editor/doc_ops_canvas.js";
import { elementFor } from "../../src/canvas/editor/skia_adapter_elements.js";

const makeDoc = () => ({ width: 200, height: 100, nodes: [
  { id: "pinned", kind: "rect", x: 140, y: 60, width: 40, height: 30,
    constraints: { horizontal: "right", vertical: "bottom" } },
] });

describe("document resize constraint entry points", () => {
  for (const [name, resize] of [
    ["exact size", (doc) => setDocumentSize(doc, 300, 150)],
    ["edge drag", (doc) => resizeDocumentEdges(doc, { right: true, bottom: true }, 100, 50)],
    ["centered edge drag", (doc) => resizeDocumentEdges(doc, { right: true, bottom: true }, 50, 25, { fromCentre: true })],
  ]) {
    it(`resolves right/bottom constraints during ${name}`, () => {
      const doc = makeDoc();
      expect(resize(doc).nodes[0]).toMatchObject({ x: 240, y: 110, width: 40, height: 30 });
      expect(doc.nodes[0]).toMatchObject({ x: 140, y: 60 });
    });
  }
  it("preserves explicit proportional content scaling without applying constraints twice", () => {
    expect(setDocumentSize(makeDoc(), 400, 200, { scaleMode: "width" }).nodes[0])
      .toMatchObject({ x: 280, y: 120, width: 80, height: 60 });
  });
  it("returns the same document for an unchanged exact size", () => {
    const doc = makeDoc();
    expect(setDocumentSize(doc, 200, 100)).toBe(doc);
  });
  it("carries nested pinned containers and their unconstrained descendants once", () => {
    const doc = { width: 200, height: 100, nodes: [
      { id: "group", kind: "group", x: 100, y: 30, width: 80, height: 60,
        constraints: { horizontal: "right", vertical: "bottom" } },
      { id: "inner", kind: "group", parentId: "group", x: 120, y: 40, width: 50, height: 40,
        constraints: { horizontal: "right", vertical: "bottom" } },
      { id: "leaf", kind: "rect", parentId: "inner", x: 125, y: 45, width: 10, height: 10 },
    ] };
    const next = setDocumentSize(doc, 300, 150);
    expect(next.nodes.map(({ x, y }) => [x, y])).toEqual([[200, 80], [220, 90], [225, 95]]);
  });
  it.each([
    ["left", "top", 140, 60, 40, 30],
    ["center", "center", 190, 85, 40, 30],
    ["leftRight", "topBottom", 140, 60, 140, 80],
    ["scale", "scale", 210, 90, 60, 45],
  ])("resolves %s/%s at every resize entry point", (horizontal, vertical, x, y, width, height) => {
    const doc = makeDoc();
    doc.nodes[0].constraints = { horizontal, vertical };
    for (const next of [setDocumentSize(doc, 300, 150), resizeDocumentEdges(doc, { right: true, bottom: true }, 100, 50)]) {
      expect(next.nodes[0]).toMatchObject({ x, y, width, height });
    }
  });
  it("preserves legacy centering for unconstrained documents", () => {
    const doc = makeDoc();
    delete doc.nodes[0].constraints;
    expect(setDocumentSize(doc, 300, 150).nodes[0]).toMatchObject({ x: 190, y: 85 });
    expect(resizeDocumentEdges(doc, { right: true }, 100, 0).nodes[0]).toMatchObject({ x: 140, y: 60 });
  });
  it("passes italic to the real Skia text painter input", () => {
    const node = { id: "text", kind: "text", x: 0, y: 0, width: 100, height: 40, text: "Italic", italic: true };
    expect(elementFor(node, 0, 0, 0, () => null, null)).toMatchObject({ italic: true });
  });
});

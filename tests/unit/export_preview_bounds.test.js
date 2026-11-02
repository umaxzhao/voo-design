/**
 * UF20 contract: the export dialog's selection preview must use the same
 * bounds and pixel rounding as the real selection export.
 */
import { describe, expect, it } from "vitest";
import {
  selectedExportBounds,
  selectedExportNodes,
} from "../../src/canvas/editor/editor_export_selection.js";
import { exportPixelSize } from "../../src/canvas/editor/editor_export_bounds.js";
import { designExportDimensions } from "../../src/canvas/components/editor_export_dialog.jsx";

const rect = (id, x, y, width, height, parentId = null) => ({
  id,
  kind: "rect",
  x,
  y,
  width,
  height,
  parentId,
});

// An ordinary group padded far beyond its children: the export must ignore that padding.
const paddedGroupDoc = {
  width: 400,
  height: 400,
  nodes: [
    { id: "g", kind: "group", x: 0, y: 0, width: 200, height: 200, parentId: null },
    rect("a", 10, 10, 50, 50, "g"),
    rect("b", 100, 60, 40, 40, "g"),
  ],
};

describe("export preview bounds (UF20)", () => {
  it("ignores ordinary group padding and uses the tight union of its layers", () => {
    const bounds = selectedExportBounds(selectedExportNodes(paddedGroupDoc, ["g"]));
    expect(bounds).toEqual({ x: 10, y: 10, width: 130, height: 90 });
  });

  it("keeps a frame's own box as its export bounds", () => {
    const doc = {
      width: 400,
      height: 400,
      nodes: [
        { id: "f", kind: "group", isFrame: true, x: 0, y: 0, width: 300, height: 300, parentId: null },
        rect("a", 10, 10, 50, 50, "f"),
      ],
    };
    const bounds = selectedExportBounds(selectedExportNodes(doc, ["f"]));
    expect(bounds).toEqual({ x: 0, y: 0, width: 300, height: 300 });
  });

  it("unions multiple selected roots", () => {
    const doc = {
      width: 400,
      height: 400,
      nodes: [rect("p", 0, 0, 20, 20), rect("q", 50, 40, 30, 10)],
    };
    const bounds = selectedExportBounds(selectedExportNodes(doc, ["p", "q"]));
    expect(bounds).toEqual({ x: 0, y: 0, width: 80, height: 50 });
  });

  it("returns no bounds for an empty selection", () => {
    expect(selectedExportBounds(selectedExportNodes(paddedGroupDoc, []))).toBeNull();
  });

  it.each([1, 2, 1.5, 0.3])(
    "previews the same pixel size as the export at scale %s",
    (scale) => {
      const bounds = selectedExportBounds(selectedExportNodes(paddedGroupDoc, ["g"]));
      const exported = exportPixelSize(bounds, scale);
      const previewed = designExportDimensions({
        width: bounds.width,
        height: bounds.height,
        format: "png",
        scale,
      });
      expect(previewed).toEqual({ width: exported.width, height: exported.height });
    },
  );

  it("keeps vector formats at document size in the preview", () => {
    const bounds = selectedExportBounds(selectedExportNodes(paddedGroupDoc, ["g"]));
    expect(
      designExportDimensions({ width: bounds.width, height: bounds.height, format: "svg", scale: 2 }),
    ).toEqual({ width: 130, height: 90 });
  });
});

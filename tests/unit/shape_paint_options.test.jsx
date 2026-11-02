// Shape tools carry their own fill (the colour wheel), stroke colour, stroke
// weight and opacity into the node they create.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { createDrawingShapesApi } from "../../src/canvas/editor/drawing_api_shapes.js";
import ShapeProperties from "../../src/canvas/components/editor_properties/shape_properties.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

function api() {
  let doc = { nodes: [] };
  return {
    api: createDrawingShapesApi({
      getDoc: () => doc,
      setDoc: (next) => {
        doc = next;
      },
      selectMany: () => {},
      getColor: () => "#999999",
    }),
    getDoc: () => doc,
  };
}

describe("shape paint options", () => {
  it("creates a rect with fill, stroke, weight and opacity", () => {
    const { api: drawing, getDoc } = api();
    const node = drawing.addRectAt(
      { x: 10, y: 20 },
      { fill: "#112233", stroke: "#445566", strokeWidth: 3, opacity: 0.5 },
    );
    expect(node).toMatchObject({
      fill: "#112233",
      stroke: "#445566",
      strokeWidth: 3,
      opacity: 0.5,
    });
    expect(getDoc().nodes[0]).toMatchObject({ strokeWidth: 3, opacity: 0.5 });
  });

  it("carries a dashed stroke into the created rect", () => {
    const { api: drawing } = api();
    const node = drawing.addRectAt(
      { x: 0, y: 0 },
      { strokeWidth: 4, strokeDash: "dashed" },
    );
    expect(node.strokeDash).toBe("dashed");
  });

  it("creates an ellipse with the same paint axes", () => {
    const { api: drawing } = api();
    const node = drawing.addEllipseAt(
      { x: 0, y: 0 },
      { fill: "#abcdef", stroke: "#123456", strokeWidth: 2, opacity: 0.8 },
    );
    expect(node).toMatchObject({
      fill: "#abcdef",
      stroke: "#123456",
      strokeWidth: 2,
      opacity: 0.8,
    });
  });

  it("keeps the legacy defaults when no options are passed", () => {
    const { api: drawing } = api();
    const node = drawing.addRectAt({ x: 0, y: 0 });
    expect(node.fill).toBe("#999999");
    expect(node.strokeWidth).toBe(0);
  });
});

describe("shape tool panel", () => {
  it("shows stroke colour and opacity controls", () => {
    const html = renderToStaticMarkup(
      <ShapeProperties
        tool={TOOL.RECT}
        strokeWidth={2}
        onStrokeWidth={() => {}}
        strokeColor="#445566"
        onStrokeColor={() => {}}
        opacity={0.5}
        onOpacity={() => {}}
      />,
    );
    expect(html).toContain('aria-label="editor.props.stroke"');
    expect(html).toContain('aria-label="editor.props.opacity"');
    expect(html).toContain('value="50"');
  });
});

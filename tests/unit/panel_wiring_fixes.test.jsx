// P0 wiring fixes from the right-panel audit: shape stroke weight, tool
// background colour, empty tool panels and the unsupported Fill tolerance UI.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import ShapeProperties from "../../src/canvas/components/editor_properties/shape_properties.jsx";
import ToolColorProperties from "../../src/canvas/components/editor_properties/tool_color_properties.jsx";
import ToolPropertiesSection from "../../src/canvas/components/editor_properties/tool_properties_section.jsx";
import GradientProperties from "../../src/canvas/components/editor_properties/gradient_properties.jsx";
import MixedField from "../../src/canvas/components/editor_properties/mixed_field.jsx";
import { createPathNode } from "../../src/canvas/editor/scene_model_paths.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("shape stroke weight", () => {
  it("uses the shape stroke width, not the brush width", () => {
    const html = renderToStaticMarkup(
      <ShapeProperties
        tool={TOOL.RECT}
        strokeWidth={7}
        onStrokeWidth={() => {}}
        brushWidth={24}
        onBrushWidth={() => {}}
      />,
    );
    expect(html).toContain('value="7"');
    expect(html).not.toContain('value="24"');
  });
});

describe("tool background swatch", () => {
  it("renders the engine background colour as the BG swatch", () => {
    const html = renderToStaticMarkup(
      <ToolColorProperties
        color="#112233"
        onColor={() => {}}
        backgroundColor="#445566"
        onBackgroundColor={() => {}}
      />,
    );
    expect(html).toContain("445566");
  });
});

describe("empty tool panels", () => {
  it("explains tools that take over the rail without controls", () => {
    const html = renderToStaticMarkup(
      <ToolPropertiesSection tool={TOOL.HAND} />,
    );
    expect(html).toContain("editor.toolOptions.emptyTitle");
    expect(html).toContain("editor.toolOptions.emptyHint");
  });
});

describe("fill tool options", () => {
  it("shows tolerance and contiguous now that the bucket uses them", () => {
    const html = renderToStaticMarkup(
      <GradientProperties
        tool={TOOL.FILL}
        fillTolerance={32}
        onFillTolerance={() => {}}
        fillContiguous
        onFillContiguous={() => {}}
        fillSampleAll={false}
        onFillSampleAll={() => {}}
      />,
    );
    expect(html).toContain("editor.fill.tolerance");
    expect(html).toContain("editor.fill.contiguous");
    expect(html).toContain("editor.fill.sampleAll");
    expect(html).toContain('aria-checked="false"');
  });
});

describe("mixed fields", () => {
  it("becomes an input when a handler can apply the typed value", () => {
    const html = renderToStaticMarkup(
      <MixedField label="Font size" suffix="px" onValueChange={() => {}} />,
    );
    expect(html).toContain("<input");
    expect(html).toContain("—px");
  });

  it("stays a read-only dash without a handler", () => {
    const html = renderToStaticMarkup(<MixedField label="W" />);
    expect(html).not.toContain("<input");
  });
});

describe("path arrow/stroke fields", () => {
  it("keeps arrowEnd=false and a dashed stroke on the node", () => {
    const node = createPathNode({
      points: [[0, 0], [10, 10]],
      stroke: "#fff",
      strokeWidth: 2,
      arrow: true,
      arrowEnd: false,
      strokeDash: "dashed",
    });
    expect(node.arrowEnd).toBe(false);
    expect(node.strokeDash).toBe("dashed");
  });

  it("omits the fields for a default arrow", () => {
    const node = createPathNode({
      points: [[0, 0], [10, 10]],
      stroke: "#fff",
      strokeWidth: 2,
      arrow: true,
      arrowEnd: true,
    });
    expect(node).not.toHaveProperty("arrowEnd");
    expect(node).not.toHaveProperty("strokeDash");
  });
});

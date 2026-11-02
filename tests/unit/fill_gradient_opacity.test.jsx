// Fill and Gradient tools expose an opacity control, and the engine applies it
// at paint time (vector fill opacity, pixel fill alpha, gradient stop alpha).
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import {
  colourWithOpacity,
  scaleGradientStops,
} from "../../src/canvas/editor/selection_effects_paint.js";
import ToolPropertiesSection from "../../src/canvas/components/editor_properties/tool_properties_section.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("fill and gradient opacity", () => {
  it("turns a hex colour into rgba with the tool opacity", () => {
    expect(colourWithOpacity("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(colourWithOpacity("#ff0000", 1)).toBe("#ff0000");
    expect(colourWithOpacity("transparent", 0.5)).toBe("transparent");
  });

  it("scales every gradient stop's opacity", () => {
    const stops = [
      { color: "#FFFFFF", opacity: 100, position: 0 },
      { color: "#000000", opacity: 40, position: 100 },
    ];
    expect(scaleGradientStops(stops, 0.5).map((stop) => stop.opacity)).toEqual([
      50, 20,
    ]);
    expect(scaleGradientStops(stops, 1)).toEqual(stops);
  });

  it("renders the opacity row for the Fill tool", () => {
    const html = renderToStaticMarkup(
      <ToolPropertiesSection
        tool={TOOL.FILL}
        color="#ffffff"
        onColor={() => {}}
        fillTolerance={32}
        onFillTolerance={() => {}}
        fillContiguous
        onFillContiguous={() => {}}
        fillSampleAll={false}
        onFillSampleAll={() => {}}
        fillOpacity={0.6}
        onFillOpacity={() => {}}
      />,
    );
    expect(html).toContain('aria-label="editor.props.opacity"');
    expect(html).toContain('value="60"');
  });

  it("renders the opacity row for the Gradient tool", () => {
    const html = renderToStaticMarkup(
      <ToolPropertiesSection
        tool={TOOL.GRADIENT}
        color="#ffffff"
        onColor={() => {}}
        gradientType="linear"
        onGradientType={() => {}}
        gradientStops={[
          { color: "#FFFFFF", opacity: 100, position: 0 },
          { color: "#000000", opacity: 100, position: 100 },
        ]}
        onGradientStops={() => {}}
        gradientOpacity={0.4}
        onGradientOpacity={() => {}}
      />,
    );
    expect(html).toContain('aria-label="editor.props.opacity"');
    expect(html).toContain('value="40"');
  });
});

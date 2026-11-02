import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { computeImageStats } from "../../src/canvas/editor/histogram.js";
import HistogramStrip, { HistogramView } from "../../src/canvas/components/editor_properties/histogram_strip.jsx";
import ImageContextActions from "../../src/canvas/components/editor_properties/image_context_actions.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

// Keep the actual histogram view and image-tools hierarchy. Only replace the
// bitmap analysis hook, whose effect cannot run during static rendering.
vi.mock("../../src/canvas/components/editor_properties/use_layer_histogram.js", () => ({
  useLayerHistogram: (bitmap) => bitmap?.testStats ?? null,
}));

const stats = computeImageStats(new Uint8ClampedArray([
  0, 0, 0, 255,
  255, 255, 255, 255,
  128, 128, 128, 255,
  255, 0, 0, 255,
]));
const graphCount = (html) => (html.match(/viewBox="0 0 100 100"/g) ?? []).length;

function expectClippingReadout(html) {
  expect(html).toContain("editor.histogram.clipLow");
  expect(html).toContain("editor.histogram.clipHigh");
  expect(html.match(/>25%<\/span>/g)).toHaveLength(2);
}

describe("compact layer histogram", () => {
  it("retains all four channels and clipping percentages by default", () => {
    const html = renderToStaticMarkup(<HistogramView stats={stats} />);
    expect(graphCount(html)).toBe(4);
    for (const key of ["cmRed", "cmGreen", "cmBlue"]) {
      expect(html).toContain(`editor.props.${key}`);
    }
    expect(html).toContain("editor.histogram.luma");
    expectClippingReadout(html);
  });

  it("shows only luma in compact mode while retaining both clipping warnings", () => {
    const html = renderToStaticMarkup(<HistogramView stats={stats} compact />);
    expect(graphCount(html)).toBe(1);
    expect(html).toContain("editor.histogram.luma");
    for (const key of ["cmRed", "cmGreen", "cmBlue"]) {
      expect(html).not.toContain(`editor.props.${key}`);
    }
    expectClippingReadout(html);
  });

  it("does not display a histogram while no bitmap is available", () => {
    expect(renderToStaticMarkup(<HistogramStrip />)).toBe("");
    expect(renderToStaticMarkup(<HistogramStrip bitmap={null} compact />)).toBe("");
  });

  it("uses compact luma statistics in the actual image-tools section", () => {
    const html = renderToStaticMarkup(
      <ImageContextActions
        object={{ id: "image", kind: "image", width: 100, height: 100 }}
        engine={{}}
        bitmap={{ testStats: stats }}
        editAndCommit={() => {}}
      />,
    );
    expect(html).toContain('data-testid="image-context-actions"');
    expect(graphCount(html)).toBe(1);
    expect(html).toContain("editor.histogram.luma");
    expectClippingReadout(html);
  });
});

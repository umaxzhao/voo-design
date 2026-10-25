// Frame panel alignment with Figma: Clip content is a switch, and the
// optional Frame capabilities (layout grid, auto layout, fill, stroke) are
// added from a "+" in the section header instead of a big empty placeholder.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import PropertiesPanelSections from "../../src/canvas/components/editor_properties/properties_panel_sections.jsx";

const frame = (patch = {}) => ({
  id: "frame-1",
  kind: "group",
  isFrame: true,
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  clipContent: true,
  fill: "transparent",
  stroke: "transparent",
  layoutGrid: { size: 8, enabled: true },
  ...patch,
});

const renderFrame = (patch = {}) =>
  renderToStaticMarkup(
    <PropertiesPanelSections
      object={frame(patch)}
      sections={["clip", "layoutGrid", "autoLayout", "fill", "stroke"]}
      edit={vi.fn()}
      editAndCommit={vi.fn()}
      t={(key) => key}
    />,
  );

describe("Figma-style frame panel", () => {
  it("renders Clip content as a switch carrying its checked state", () => {
    const html = renderFrame();
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="editor.props.clipContent"');
    expect(html).toContain('aria-checked="true"');
  });

  it("reflects the unchecked clip state", () => {
    const html = renderFrame({ clipContent: false });
    expect(html).toContain('aria-checked="false"');
  });

  it("puts layout grid and auto layout add controls in the section header", () => {
    const html = renderFrame();
    expect(html).toContain('aria-label="editor.props.showGrid"');
    expect(html).toContain('aria-label="editor.autoLayout.enable"');
    expect(html).toContain('data-testid="editor-auto-layout-enable"');
    // The empty "Add auto layout" full-width button is gone.
    expect(html).not.toContain(
      'editor-auto-layout-enable">Add auto layout</button>',
    );
    expect(html).toContain('aria-label="editor.props.gridSize"');
  });

  it("shows paint sections for a frame (a group kind that paints)", () => {
    const html = renderFrame();
    expect(html).toContain("editor.props.fillLabel");
    expect(html).toContain("editor.props.strokeLabel");
  });

  it("offers fill and stroke through their header plus buttons only", () => {
    const html = renderFrame();
    expect(html).toContain('aria-label="editor.props.addFill"');
    expect(html).toContain('aria-label="editor.props.addStroke"');
    expect(html).not.toContain("border-dashed");
  });

  it("renders the fill row once a paint exists", () => {
    const html = renderFrame({ fill: "#ff0000", fills: [] });
    expect(html).not.toContain("border-dashed");
    expect(html).toContain("editor.props.fillLabel");
  });
});

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
import AutoLayoutModeIcon from "../../src/canvas/components/editor_properties/auto_layout_mode_icon.jsx";

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
  it.each(["none", "vertical", "horizontal", "grid"])("renders the %s layout icon at half size", (mode) => {
    const html = renderToStaticMarkup(<AutoLayoutModeIcon mode={mode} />);
    expect(html).toContain('width="12" height="12"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke-width="1.5"');
  });

  it("shows one editable W/H pair under Layout after the mode strip", () => {
    const html = renderToStaticMarkup(
      <PropertiesPanelSections
        object={frame()}
        sections={["transform", "clip", "layoutGrid", "autoLayout"]}
        edit={vi.fn()}
        editAndCommit={vi.fn()}
        t={(key) => key}
      />,
    );
    expect(html.match(/aria-label="W"/g)).toHaveLength(1);
    expect(html.match(/aria-label="H"/g)).toHaveLength(1);
    expect(html).toContain('value="200"');
    expect(html).toContain('value="120"');
    expect(html.indexOf('data-layout-mode-icon="none"')).toBeLessThan(html.indexOf('aria-label="W"'));
  });

  it("renders Clip content as a checked checkbox", () => {
    const html = renderFrame();
    expect(html).toContain('aria-label="editor.props.clipContent"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  it("reflects the unchecked clip state", () => {
    const html = renderFrame({ clipContent: false });
    expect(html).toContain('aria-label="editor.props.clipContent"');
    expect(html).not.toContain('checked=""');
  });

  it("offers Figma's none / vertical / horizontal / grid layout modes", () => {
    const html = renderFrame();
    for (const mode of ["none", "vertical", "horizontal", "grid"]) {
      expect(html).toContain(`aria-label="editor.props.layoutMode.${mode}"`);
      expect(html).toContain(`data-layout-mode-icon="${mode}"`);
    }
    // The frame's enabled layout grid selects grid mode.
    expect(html).toContain('aria-label="editor.props.layoutMode.grid" aria-pressed="true"');
    expect(html).toContain('aria-label="editor.props.showGrid"');
    expect(html).toContain('aria-label="editor.props.gridSize"');
    expect(html).toContain('aria-label="W"');
    expect(html).toContain('aria-label="H"');
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

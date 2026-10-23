/**
 * Repeat / Array wiring: the three array-modifier sections (linear, grid,
 * circular) render as one collapsible group under Transform for a single
 * non-background layer or group selection — and nowhere else.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import PropertiesPanelSections from "../../src/canvas/components/editor_properties/properties_panel_sections.jsx";

const t = (key) => key;
const noop = () => {};

function makeEngine(nodes = [], modifiers = []) {
  return {
    getDocument: () => ({ nodes, modifiers }),
    subscribeRender: () => () => {},
  };
}

function renderSections(props) {
  return renderToStaticMarkup(
    <PropertiesPanelSections
      object={{ id: "n1", kind: "group", x: 0, y: 0, width: 10, height: 10 }}
      engine={makeEngine()}
      edit={noop}
      editAndCommit={noop}
      t={t}
      {...props}
    />
  );
}

describe("Repeat / Array group", () => {
  it("renders the group with all three array sections for a single group", () => {
    const html = renderSections();
    expect(html).toContain('data-testid="editor-repeat-array-section"');
    expect(html).toContain("editor.props.repeatArray");
    expect(html).toContain('data-testid="editor-linear-array-enable"');
    expect(html).toContain('data-testid="editor-grid-array-enable"');
    expect(html).toContain('data-testid="editor-circular-array-enable"');
  });

  it("renders the group for a single non-background layer (rect)", () => {
    const html = renderSections({
      object: { id: "n2", kind: "rect", x: 0, y: 0, width: 4, height: 4 },
    });
    expect(html).toContain('data-testid="editor-repeat-array-section"');
  });

  it("places the group right after the transform section", () => {
    const html = renderSections();
    const transformAt = html.indexOf("editor.props.transform");
    const repeatAt = html.indexOf("editor.props.repeatArray");
    expect(transformAt).toBeGreaterThan(-1);
    expect(repeatAt).toBeGreaterThan(transformAt);
    // And before the sections that follow it (constraints).
    const constraintsAt = html.indexOf("editor-constraints-left");
    if (constraintsAt > -1) expect(repeatAt).toBeLessThan(constraintsAt);
  });

  it("shows the active controls when an array modifier already exists", () => {
    const html = renderSections({
      engine: makeEngine(
        [{ id: "n1", kind: "group" }],
        [
          {
            id: "m1",
            type: "linearArray",
            targetId: "n1",
            count: 3,
            step: { x: 20, y: 0, z: 0 },
          },
        ],
      ),
    });
    expect(html).toContain('data-testid="editor-linear-array-controls"');
  });

  it("hides the group on a multi-selection", () => {
    const html = renderSections({ selectionCount: 2 });
    expect(html).not.toContain("editor.props.repeatArray");
    expect(html).not.toContain("editor-linear-array-enable");
  });

  it("hides the group for the canvas background", () => {
    const html = renderSections({ isBackground: true });
    expect(html).not.toContain("editor.props.repeatArray");
  });

  it("hides the group for the frame (page) node", () => {
    const html = renderSections({
      object: {
        id: "frame1",
        kind: "frame",
        isFrame: true,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    });
    expect(html).not.toContain("editor.props.repeatArray");
  });

  it("hides the group while the warp tool owns the selection", () => {
    const html = renderSections({ isWarpTool: true, tool: "distort" });
    expect(html).not.toContain("editor.props.repeatArray");
  });

  it("hides the group for an adjustment layer", () => {
    const html = renderSections({
      object: { id: "adj1", kind: "adjustment", adjustments: [] },
    });
    expect(html).not.toContain("editor.props.repeatArray");
  });
});

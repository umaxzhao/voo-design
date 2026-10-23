/** Modifiers follow Effects in the selection-driven inspector. */

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

describe("Modifiers group", () => {
  it("renders the group with an empty stack for a single group", () => {
    const html = renderSections();
    expect(html).toContain('data-testid="editor-modifiers-section"');
    expect(html).toContain("editor.props.modifiers");
    expect(html).toContain('data-testid="editor-modifiers-empty"');
    expect(html).not.toContain('editor-repeat-array-section');
    expect(html).not.toContain('editor.props.repeatArray');
    expect(html).not.toContain('editor-linear-array-enable');
  });

  it("renders the group for a single non-background layer (rect)", () => {
    const html = renderSections({
      object: { id: "n2", kind: "rect", x: 0, y: 0, width: 4, height: 4 },
    });
    expect(html).toContain('data-testid="editor-modifiers-section"');
  });

  it("places Modifiers directly after Effects", () => {
    const html = renderSections();
    const effectsAt = html.indexOf("editor.props.effects");
    expect(effectsAt).toBeGreaterThan(-1);
    expect(html.indexOf("editor.props.modifiers")).toBeGreaterThan(effectsAt);
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
    expect(html).not.toContain("editor.props.modifiers");
    expect(html).not.toContain("editor-linear-array-enable");
  });

  it("hides the group for the canvas background", () => {
    const html = renderSections({ isBackground: true });
    expect(html).not.toContain("editor.props.modifiers");
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
    expect(html).not.toContain("editor.props.modifiers");
  });

  it("hides the group while the warp tool owns the selection", () => {
    const html = renderSections({ isWarpTool: true, tool: "distort" });
    expect(html).not.toContain("editor.props.modifiers");
  });

  it("hides the group for an adjustment layer", () => {
    const html = renderSections({
      object: { id: "adj1", kind: "adjustment", adjustments: [] },
    });
    expect(html).not.toContain("editor.props.modifiers");
  });
});

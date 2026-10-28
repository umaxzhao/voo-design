// Phase-1 panel structure: core sections stay visible in Pen/Figma order, the
// header names the layer, and fill/stroke/effects/export are first-class.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import PropertiesPanelSections from "../../src/canvas/components/editor_properties/properties_panel_sections.jsx";
import PropertiesPanelHeader from "../../src/canvas/components/editor_properties/properties_panel_header.jsx";

const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  selectMany: vi.fn(),
  updateNode: vi.fn(),
  exportSelectionPng: () => ({ dataUrl: "data:image/png;base64,AA" }),
};
const base = (patch = {}) => ({
  id: "n1",
  kind: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  fill: "#ff0000",
  stroke: "transparent",
  ...patch,
});
const render = (object, extra = {}) =>
  renderToStaticMarkup(
    <PropertiesPanelSections
      object={object}
      engine={engine}
      selectionCount={1}
      selectedNodes={[object]}
      edit={() => {}}
      editAndCommit={() => {}}
      commitNow={vi.fn()}
      t={(key) => key}
      {...extra}
    />,
  );

const order = (html, labels) => labels.map((label) => html.indexOf(label));

describe("phase-1 panel order", () => {
  it("follows Figma order: Appearance before Fill, Stroke, Effects, Export", () => {
    const html = render(base(), {
      sections: ["transform", "fill", "stroke", "effects", "export"],
    });
    const [appearance, fill, stroke, effects, exportSection] = order(html, [
      "editor.props.appearance",
      "editor.props.fillLabel",
      "editor.props.strokeLabel",
      "editor.props.effects",
      "editor.props.exportTitle",
    ]);
    expect(appearance).toBeGreaterThan(-1);
    expect(fill).toBeGreaterThan(appearance);
    expect(stroke).toBeGreaterThan(fill);
    expect(effects).toBeGreaterThan(stroke);
    expect(exportSection).toBeGreaterThan(effects);
  });

  it("puts Typography before Fill for a text layer", () => {
    const text = base({ id: "t1", kind: "text", text: "Hi", name: "Copy" });
    const html = render(text, {
      sections: ["transform", "typography", "fill", "stroke"],
    });
    const [typography, fill] = order(html, [
      "editor.props.textStyle",
      "editor.props.fillLabel",
    ]);
    expect(typography).toBeGreaterThan(-1);
    expect(fill).toBeGreaterThan(-1);
    expect(typography).toBeLessThan(fill);
  });

  it("keeps Constraints on a frame child and Fill/Stroke/Effects on a frame", () => {
    const child = base({ id: "child" });
    expect(
      render(child, { sections: ["transform", "constraints", "layer"] }),
    ).toContain("editor.constraints.title");

    const frame = base({ kind: "group", isFrame: true, fill: "transparent" });
    const html = render(frame, {
      sections: ["transform", "fill", "stroke", "effects", "export"],
    });
    for (const label of [
      "editor.props.fillLabel",
      "editor.props.strokeLabel",
      "editor.props.effects",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("shows the selection colours summary after Fill/Effects on a multi-selection", () => {
    const a = base({ id: "a", fill: "#ff0000" });
    const b = base({ id: "b", fill: "#ff0000" });
    const c = base({ id: "c", fill: "#00ff00" });
    const html = render(a, {
      sections: ["alignment", "transform", "fill", "stroke"],
      selectionCount: 3,
      selectedNodes: [a, b, c],
    });
    const colours = html.indexOf("editor.props.selectionColors");
    expect(colours).toBeGreaterThan(-1);
    expect(html).toContain("#FF0000");
    expect(html).toContain("#00FF00");
    expect(colours).toBeGreaterThan(html.indexOf("editor.props.fillLabel"));
  });

  it("shows inline binding chips for a bound variable and paint style", () => {
    const boundEngine = {
      ...engine,
      getDocument: () => ({
        nodes: [],
        variablesV2: {
          collections: [
            { id: "c1", variables: [{ id: "v1", name: "Brand/Red" }] },
          ],
        },
        styles: {
          paint: [{ id: "s1", name: "Card paint", value: { fill: "#ff0000" } }],
        },
      }),
    };
    const node = base({ fillVariableId: "v1", styleIds: { paintId: "s1" } });
    const html = render(node, { sections: ["fill", "stroke"], engine: boundEngine });
    expect(html).toContain("Brand/Red");
    expect(html).toContain("Card paint");
  });

  it("renders export presets with format, scale and suffix", () => {
    const html = render(base(), { sections: ["export"] });
    expect(html).toContain("editor.props.exportFormat");
    expect(html).toContain("editor.props.exportSuffix");
    expect(html).toContain("editor.props.addExportSettings");
    expect(html).toContain("editor.exportScale");
  });
});

describe("phase-1 header", () => {
  const header = (props) =>
    renderToStaticMarkup(
      <PropertiesPanelHeader
        object={props.object}
        selectionCount={props.selectionCount ?? 1}
        isToolActive={props.isToolActive ?? false}
        onRename={props.onRename}
        t={(key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key)}
      />,
    );

  it("names the selected layer and its type", () => {
    const html = header({ object: base({ name: "Card" }) });
    expect(html).toContain("Card");
    expect(html).toContain(">rect<");
    expect(html).not.toContain("editor.properties");
  });

  it("shows the selection count for a multi-selection", () => {
    const html = header({
      object: base({ name: "Card" }),
      selectionCount: 3,
    });
    expect(html).toContain("editor.props.multiSelected");
    expect(html).toContain("editor.props.multiSelected");
  });

  it("falls back to the panel title when nothing is selected", () => {
    const html = header({ object: null });
    expect(html).toContain("editor.properties");
  });
});

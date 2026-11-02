import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import BrushProperties from "../../src/canvas/components/editor_properties/brush_properties.jsx";
import SelectedNodeActions from "../../src/canvas/components/editor_properties/selected_node_actions.jsx";
import { WORKBENCHES } from "../../src/canvas/components/editor_workbench.js";
import { CANVAS_TYPE } from "../../src/canvas/editor/scene_doc_factory.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

const noop = () => {};
const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  setTool: noop,
};
const rect = { id: "r1", kind: "rect", x: 0, y: 0, width: 40, height: 40, fill: "#ff0000" };

describe("select with nothing selected", () => {
  it("keeps the inspector open in the design workbench", () => {
    expect(WORKBENCHES[CANVAS_TYPE.DESIGN].inspectorAlwaysOpen).toBe(true);
  });

  it("renders the page section in the properties panel", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.SELECT}
        object={null}
        engine={engine}
        docSize={{ width: 800, height: 600 }}
      />,
    );
    expect(html).toContain('data-testid="editor-properties-panel"');
    expect(html).toContain("editor.props.bgColor");
    expect(html).toContain("800");
  });
});

describe("layer section", () => {
  it("is absent for a single non-group node", () => {
    const html = renderToStaticMarkup(
      <SelectedNodeActions object={rect} selectedNodes={[]} engine={engine} />,
    );
    expect(html).toBe("");
    const panel = renderToStaticMarkup(
      <EditorProperties tool={TOOL.SELECT} object={rect} engine={engine} />,
    );
    expect(panel).not.toContain("editor.layer.title");
  });

  it("is shown when it has a group row", () => {
    const html = renderToStaticMarkup(
      <SelectedNodeActions
        object={{ ...rect, id: "g1", kind: "group" }}
        selectedNodes={[]}
        engine={engine}
      />,
    );
    expect(html).toContain("editor.layer.title");
    expect(html).toContain("editor-taskbar-ungroup");
  });
});

describe("healing AI repair", () => {
  it("shows Hardness and Opacity next to Width, without Flow", () => {
    const html = renderToStaticMarkup(
      <BrushProperties
        tool={TOOL.HEALING}
        healingMode="aiRepair"
        onBrushWidth={noop}
        onBrushHardness={noop}
        onBrushOpacity={noop}
        onBrushFlow={noop}
        onBrushStrength={noop}
      />,
    );
    expect(html).toContain("editor.brushWidth");
    expect(html).toContain("editor.brushHardness");
    expect(html).toContain("editor.brushOpacity");
    expect(html).not.toContain("editor.brushFlow");
    expect(html).not.toContain("editor.brushStrength");
  });
});

// The right panel shows only what the current tool or selection needs; every
// extra capability hides behind the single add menu and empty sections do not render.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import fs from "node:fs";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import PropertiesPanelSections from "../../src/canvas/components/editor_properties/properties_panel_sections.jsx";
import PanelAddMenu from "../../src/canvas/components/editor_properties/panel_add_menu.jsx";
import { FillSection } from "../../src/canvas/components/editor_properties/colour_fill_section.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const noop = () => {};
const engine = { getDocument: () => ({ nodes: [], modifiers: [] }), subscribeRender: () => () => {}, setTool: noop, exportSelectionPng: () => ({ dataUrl: "data:image/png;base64,AA" }) };
const image = { id: "img", kind: "image", x: 0, y: 0, width: 100, height: 80, adjustments: {} };
const rect = { id: "r1", kind: "rect", x: 0, y: 0, width: 40, height: 40, fill: "#ff0000" };

const renderSections = (object, extra = {}) =>
  renderToStaticMarkup(
    <PropertiesPanelSections
      object={object}
      engine={engine}
      selectionCount={1}
      selectedNodes={[object]}
      edit={noop}
      editAndCommit={noop}
      commitNow={vi.fn()}
      t={(key) => key}
      {...extra}
    />,
  );

describe("top tool-options bar is gone", () => {
  it("deletes the raster context toolbar component", () => {
    expect(
      fs.existsSync(new URL("../../src/canvas/components/editor_properties/raster_context_toolbar.jsx", import.meta.url)),
    ).toBe(false);
  });

  it("renders no context toolbar above the canvas for an image selection", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.SELECT} object={image} engine={engine} />);
    expect(html).not.toContain("image-context-toolbar");
    expect(html).not.toContain('role="toolbar"');
  });
});

describe("image controls live in the panel", () => {
  it("shows crop, replace and fit / fill in the image actions of an image selection", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.SELECT} object={image} engine={engine} />);
    expect(html).toContain('data-testid="image-context-actions"');
    expect(html).toContain("editor.frequencySeparation.action");
    expect(html).toContain("editor.image.fitFill");
    expect(html).not.toContain("editor.taskbar.crop");
    expect(html).not.toContain("editor.taskbar.replace");
    expect(html).not.toContain('type="file"');
  });

  it("renders the image tools as an always-open section", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.SELECT} object={image} engine={engine} />);
    expect(html).toContain('data-testid="image-context-actions"');
    expect(html).toContain("editor.image.tools");
    expect(html).not.toMatch(/<details[^>]*data-testid="image-context-actions"/);
  });

  it("does not show the image actions for non-image layers", () => {
    expect(renderSections(rect, { sections: ["transform", "fill", "effects"] })).not.toContain("image-context-actions");
    expect(renderToStaticMarkup(<EditorProperties tool={TOOL.SELECT} object={rect} engine={engine} />)).not.toContain("image-context-actions");
  });
});

describe("brush options live in the right panel", () => {
  const toolProps = { color: "#00ffcc", onColor: noop, brushWidth: 24, onBrushWidth: noop, brushHardness: 0.5, onBrushHardness: noop, brushOpacity: 1, onBrushOpacity: noop, brushMode: "normal" };

  it("shows the brush options with nothing selected", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.BRUSH} toolProps={toolProps} />);
    expect(html).toContain('data-testid="editor-properties-panel"');
    expect(html).toContain("editor.tool.brush");
    expect(html).not.toContain("image-context-toolbar");
  });

  it("keeps the brush options in the panel over a selected image, instead of the image sections", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.BRUSH} toolProps={toolProps} object={image} engine={engine} />);
    expect(html).toContain("editor.tool.brush");
    expect(html).not.toContain("image-context-actions");
    expect(html).not.toContain("image-context-toolbar");
  });
});

describe("core sections are always visible; advanced extras hide behind one add menu", () => {
  it("renders core shape sections while unconfigured export stays behind Add", () => {
    const html = renderSections(rect, { sections: ["alignment", "transform", "constraints", "layer", "fill", "stroke", "effects", "export"] });
    for (const shown of [
      "editor.constraints.title",
      "editor.props.effects",
      "editor.props.addEffect",
      "editor.props.appearance",
    ]) {
      expect(html, shown).toContain(shown);
    }
    for (const hidden of [
      "editor.props.exportTitle",
      "editor.props.addExportSettings",
      "editor-live-filter-section",
      "editor-modifiers-section",
      "editor-style-section",
      "editor.variables.title",
      "editor.layers.noEffects",
    ]) {
      expect(html, hidden).not.toContain(hidden);
    }
    expect(html.match(/data-testid="properties-add-menu"/g)).toHaveLength(1);
  });

  it("keeps the Effects header even with an empty stack", () => {
    const html = renderSections(rect, { sections: ["effects"] });
    expect(html).toContain("editor.props.effects");
    expect(html).toContain("editor.props.addEffect");
  });

  it("shows constraints whenever the selection supports them", () => {
    const sections = ["transform", "constraints", "layer"];
    expect(renderSections(rect, { sections })).toContain("editor.constraints.title");
    expect(renderSections({ ...rect, constraints: { horizontal: "left", vertical: "top" } }, { sections })).toContain("editor.constraints.title");
  });

  it("lists the applicable extras in the add menu and runs export directly", () => {
    const items = [
      { key: "effects", label: "Effects", onSelect: vi.fn() },
      { key: "export", label: "Export PNG", onSelect: vi.fn() },
    ];
    const html = renderToStaticMarkup(<PanelAddMenu items={items} defaultOpen />);
    expect(html).toContain('role="menu"');
    expect(html).toContain('data-testid="properties-add-effects"');
    expect(html).toContain('data-testid="properties-add-export"');
    expect(renderToStaticMarkup(<PanelAddMenu items={[]} />)).toBe("");
    // Collapsed by default: only the single add row is in the panel.
    expect(renderToStaticMarkup(<PanelAddMenu items={items} />)).not.toContain('role="menu"');
  });
});

describe("fill row", () => {
  it("keeps visibility inside the fill row; the blend mode lives in the colour picker", () => {
    const html = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000" }} edit={noop} editAndCommit={noop} />,
    );
    expect(html).not.toContain('aria-label="Fill blend mode"');
    expect(html.match(/aria-label="editor.fillPicker.visibility"/g)).toHaveLength(1);
    expect(html).not.toContain('type="checkbox"');
    // Even a non-normal mode no longer names itself in the row.
    const dodge = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000", fillBlendMode: "color-dodge" }} edit={noop} editAndCommit={noop} />,
    );
    expect(dodge).not.toContain(">color-dodge<");
  });
});

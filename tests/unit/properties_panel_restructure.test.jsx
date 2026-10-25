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
import ImageSection, { fitImageToParent } from "../../src/canvas/components/editor_properties/image_section.jsx";
import { FillSection } from "../../src/canvas/components/editor_properties/colour_fill_section.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const noop = () => {};
const engine = { getDocument: () => ({ nodes: [], modifiers: [] }), subscribeRender: () => () => {}, setTool: noop };
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
  it("shows crop, replace and fit / fill in the Image section of an image selection", () => {
    const html = renderToStaticMarkup(<EditorProperties tool={TOOL.SELECT} object={image} engine={engine} />);
    expect(html).toContain('data-testid="editor-image-section"');
    expect(html).toContain("editor.taskbar.crop");
    expect(html).toContain("editor.taskbar.replace");
    expect(html).toContain("editor.image.fitFill");
    expect(html).toContain('type="file"');
  });

  it("does not show the Image section for non-image layers", () => {
    expect(renderSections(rect, { sections: ["transform", "fill", "effects"] })).not.toContain("editor-image-section");
  });

  it("crop hands over to the crop tool and fit scales into the parent", () => {
    const setTool = vi.fn();
    const section = ImageSection({ object: image, engine: { setTool }, editAndCommit: noop });
    const cropButton = section.props.children[0].props.children[0];
    cropButton.props.onClick();
    expect(setTool).toHaveBeenCalledWith("crop");
    expect(fitImageToParent(image, { x: 0, y: 0, width: 200, height: 200 }, "fit")).toEqual({ width: 200, height: 160, x: 0, y: 20 });
    expect(fitImageToParent(image, { x: 0, y: 0, width: 200, height: 200 }, "fill")).toEqual({ width: 250, height: 200, x: -25, y: 0 });
    expect(fitImageToParent(image, { width: 0, height: 0 }, "fit")).toBeNull();
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
    expect(html).not.toContain("editor-image-section");
    expect(html).not.toContain("image-context-toolbar");
  });
});

describe("empty sections do not render; extras hide behind one add menu", () => {
  it("renders only the minimal default sections for a plain shape", () => {
    const html = renderSections(rect, { sections: ["alignment", "transform", "constraints", "layer", "fill", "stroke", "effects", "export"] });
    for (const hidden of [
      "editor-live-filter-section",
      "editor-modifiers-section",
      "editor-style-section",
      "editor.variables.title",
      "editor.constraints.title",
      "editor.props.effects",
      "editor.layers.noEffects",
    ]) {
      expect(html).not.toContain(hidden);
    }
    expect(html.match(/data-testid="properties-add-menu"/g)).toHaveLength(1);
  });

  it("renders the Effects section (header with add) only once the layer has an adjustment", () => {
    const html = renderSections({ ...rect, adjustments: { brightness: { enabled: true, value: 10 } } }, { sections: ["effects"] });
    expect(html).toContain("editor.props.effects");
    expect(html).toContain("editor.props.addEffect");
  });

  it("shows constraints only once they are set on the layer", () => {
    const sections = ["transform", "constraints", "layer"];
    expect(renderSections(rect, { sections })).not.toContain("editor.constraints.title");
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
  it("keeps visibility and blend mode inside the fill row, not as a second full-width bar", () => {
    const html = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000" }} edit={noop} editAndCommit={noop} />,
    );
    expect(html.match(/aria-label="Fill blend mode"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Fill visible"/g)).toHaveLength(1);
    expect(html).not.toContain('type="checkbox"');
    // Normal blend shows no mode name; a non-normal mode names itself.
    expect(html).not.toContain(">source-over<");
    const dodge = renderToStaticMarkup(
      <FillSection object={{ kind: "rect", fill: "#ff0000", fillBlendMode: "color-dodge" }} edit={noop} editAndCommit={noop} />,
    );
    expect(dodge).toContain(">color-dodge<");
  });
});

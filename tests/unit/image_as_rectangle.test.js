// An image is a rectangle with an image fill: it gets the regular rectangle
// panel, and its image-only tools sit in one collapsed disclosure.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { PROPERTY_SECTIONS } from "../../src/canvas/components/editor_properties/resolve_panel_context.js";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  setTool: () => {},
};
const image = { id: "img", kind: "image", x: 0, y: 0, width: 100, height: 80, adjustments: {} };

const renderImagePanel = () =>
  renderToStaticMarkup(
    React.createElement(EditorProperties, { tool: TOOL.SELECT, object: image, engine }),
  );

describe("image as rectangle", () => {
  it("uses the rectangle section list", () => {
    expect(PROPERTY_SECTIONS.image).toEqual(PROPERTY_SECTIONS.rectangle);
  });

  it("renders the image tools as an always-open inspector section", () => {
    const html = renderImagePanel();
    expect(html).toContain('data-testid="image-context-actions"');
    expect(html).not.toContain('data-testid="image-context-toolbar"');
    expect(html).toContain("editor.image.tools");
    expect(html).toContain("editor.frequencySeparation.action");
  });

  it("keeps crop and replace out of the image section", () => {
    const html = renderImagePanel();
    const start = html.indexOf('data-testid="image-context-actions"');
    const body = html.slice(start, start + 3000);
    expect(body).toContain("editor.image.tools");
    expect(body).toContain("editor.frequencySeparation.action");
    expect(body).not.toContain('data-testid="editor-taskbar-crop"');
    expect(body).not.toContain('data-testid="editor-taskbar-replace"');
  });

  it("shows the regular fill, stroke and effects sections for an image", () => {
    const html = renderImagePanel();
    expect(html).toContain("editor.props.fill");
    expect(html).toContain("editor.props.stroke");
  });
});

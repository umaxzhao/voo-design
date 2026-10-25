// Inspect (Dev Mode-style) readouts and copyable code.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { inspectCss, inspectTailwind } from "../../src/canvas/editor/inspect_code.js";
import InspectPanel from "../../src/canvas/components/editor_properties/inspect_panel.jsx";
import PropertiesPanelHeader from "../../src/canvas/components/editor_properties/properties_panel_header.jsx";

const rect = {
  id: "r1",
  kind: "rect",
  x: 40,
  y: 20,
  width: 240,
  height: 120,
  fill: "#d4d4d4",
  stroke: "#000000",
  strokeWidth: 2,
  cornerRadius: 8,
  opacity: 0.8,
};
const text = {
  id: "t1",
  kind: "text",
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  fill: "#ffffff",
  fontFamily: "Inter",
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: 1,
  textAlign: "center",
};

describe("inspect code", () => {
  it("generates CSS for a rect", () => {
    const css = inspectCss(rect);
    expect(css).toContain("left: 40px;");
    expect(css).toContain("width: 240px;");
    expect(css).toContain("background: #d4d4d4;");
    expect(css).toContain("border: 2px solid #000000;");
    expect(css).toContain("border-radius: 8px;");
    expect(css).toContain("opacity: 0.8;");
  });

  it("generates typography CSS and Tailwind classes", () => {
    const css = inspectCss(text);
    expect(css).toContain('font-family: "Inter";');
    expect(css).toContain("font-size: 24px;");
    expect(css).toContain("text-align: center;");
    const tw = inspectTailwind(text);
    expect(tw).toContain("w-[200px]");
    expect(tw).toContain("text-[24px]");
    expect(tw).toContain("font-[700]");
    expect(tw).toContain("text-center");
  });

  it("omits paint when transparent", () => {
    expect(inspectCss({ ...rect, fill: "transparent", stroke: "transparent" })).not.toContain("background: transparent");
    expect(inspectCss({ ...rect, fill: "transparent", stroke: "transparent" })).not.toContain("border:");
  });
});

describe("inspect panel", () => {
  const engine = {
    getDocument: () => ({ nodes: [], styles: { paint: [] } }),
  };

  it("renders geometry, spacing, code and copy actions", () => {
    const html = renderToStaticMarkup(
      <InspectPanel object={rect} parentNode={{ x: 0, y: 0, width: 400, height: 300 }} engine={engine} />,
    );
    expect(html).toContain("editor.inspect.geometry");
    expect(html).toContain("editor.inspect.spacing");
    expect(html).toContain("editor.inspect.code");
    expect(html).toContain("editor.inspect.copyCss");
    expect(html).toContain("editor.inspect.copyTailwind");
    expect(html).toContain("left: 40px;");
  });

  it("shows typography for text and token names when bound", () => {
    const bound = {
      ...text,
      fillVariableId: "v1",
      styleIds: { paintId: "s1" },
    };
    const docEngine = {
      getDocument: () => ({
        nodes: [],
        variablesV2: { collections: [{ id: "c", variables: [{ id: "v1", name: "Brand/White" }] }] },
        styles: { paint: [{ id: "s1", name: "Body", value: { fill: "#ffffff" } }] },
      }),
    };
    const html = renderToStaticMarkup(<InspectPanel object={bound} engine={docEngine} />);
    expect(html).toContain("editor.inspect.typography");
    expect(html).toContain("Brand/White");
    expect(html).toContain("Body");
  });

  it("header exposes the inspect toggle", () => {
    const html = renderToStaticMarkup(
      <PropertiesPanelHeader
        showInspect
        onToggleInspect={vi.fn()}
        object={rect}
        selectionCount={1}
        t={(key) => key}
      />,
    );
    expect(html).toContain('data-testid="editor-inspect-trigger"');
    expect(html).toContain("editor.inspect.title");
  });
});

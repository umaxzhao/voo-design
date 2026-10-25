// W/H sizing modes in Transform: frame modes, auto-layout child fill/hug.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import TransformSection from "../../src/canvas/components/editor_properties/transform_section.jsx";

const frame = (patch = {}) => ({
  id: "f1",
  kind: "group",
  isFrame: true,
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  autoLayout: {
    direction: "vertical",
    gap: 8,
    padding: 0,
    widthMode: "hug",
    heightMode: "hug",
  },
  ...patch,
});
const child = (patch = {}) => ({
  id: "c1",
  kind: "rect",
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  layoutWidth: "fill",
  layoutHeight: "fixed",
  ...patch,
});

const render = (object, parentLayout = null) =>
  renderToStaticMarkup(
    <TransformSection
      object={object}
      selectedNodes={[object]}
      edit={() => {}}
      editAndCommit={() => {}}
      parentLayout={parentLayout}
    />,
  );

describe("sizing modes", () => {
  it("shows hug/fixed for a frame with auto layout", () => {
    const html = render(frame());
    expect(html).toContain("editor.props.sizingWidth");
    expect(html).toContain("editor.props.sizingHeight");
    expect(html).toContain("editor.sizing.hug");
    expect(html).toContain('aria-label="editor.props.sizingWidth"');
    expect(html).toContain('aria-label="editor.props.sizingHeight"');
  });

  it("shows fill/hug/fixed for an auto-layout child", () => {
    const html = render(child(), { direction: "vertical" });
    expect(html).toContain("editor.sizing.fill");
    expect(html).toContain("editor.sizing.fixed");
  });

  it("does not show sizing for a plain layer outside auto layout", () => {
    const html = render(child({ layoutWidth: undefined, layoutHeight: undefined }));
    expect(html).not.toContain("editor.props.sizingWidth");
  });
});
